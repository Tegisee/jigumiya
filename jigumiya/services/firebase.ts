import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  signInAnonymously as firebaseSignInAnonymously,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
// @ts-ignore — RN-specific export in @firebase/auth/dist/rn
import { getReactNativePersistence } from '@firebase/auth/dist/rn/index.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  writeBatch,
  increment,
  onSnapshot,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type {
  TrackedItem,
  SharedProduct,
  TrackedRef,
  FavoriteRef,
  PriceDrop,
  CategoryBest,
  MetaConfig,
} from '../types';

const firebaseConfig = {
  apiKey: 'AIzaSyAMGMGrOJw1TqdytZqB_Y0-roiYRyKQ5Ho',
  projectId: 'jigumiya',
  storageBucket: 'jigumiya.firebasestorage.app',
  messagingSenderId: '250441543259',
  appId: Platform.OS === 'android'
    ? '1:250441543259:android:28d985603a4f995905197e'
    : '1:250441543259:ios:e189afc3afc8685d05197e',
};

// Firebase 초기화 (중복 방지)
const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
const db = getFirestore(app);
const functions = getFunctions(app, 'asia-northeast3');

// ─── Cloud Functions Callable ───

export type ResolveAffiliateResult =
  | { ok: true; shortenUrl: string; originalUrl: string }
  | { ok: false; error: string; detail?: string };

const resolveAffiliateCallable = httpsCallable<
  { sharedUrl: string },
  ResolveAffiliateResult
>(functions, 'resolveAndGenerateAffiliateUrl');

/**
 * Cloud Functions `resolveAndGenerateAffiliateUrl` 호출.
 * 서버가 link.coupang.com → vp URL resolve + /deeplink API 호출까지 일괄 처리.
 * 네트워크/배포 오류 시 { ok: false, error: 'callable_error' } 반환 — 예외는 내부 흡수.
 */
export async function callResolveAffiliate(
  sharedUrl: string,
): Promise<ResolveAffiliateResult> {
  try {
    const { data } = await resolveAffiliateCallable({ sharedUrl });
    return data;
  } catch (e) {
    console.warn('[Functions] resolveAffiliate 실패:', e);
    return {
      ok: false,
      error: 'callable_error',
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Anonymous Auth 로그인 (자동) — AsyncStorage 복원 완료 대기 후 판단 */
export async function signInAnonymously(): Promise<string | null> {
  try {
    // Auth 상태 복원 완료 대기 (AsyncStorage에서 이전 UID 복원)
    const restoredUser = await new Promise<User | null>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });

    if (restoredUser) return restoredUser.uid;

    const credential = await firebaseSignInAnonymously(auth);
    return credential.user.uid;
  } catch (e) {
    console.warn('[Firebase] 익명 로그인 실패:', e);
    return null;
  }
}

/** 현재 로그인된 uid 반환 */
export function getCurrentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

// ─── Push Token / 알림 설정 ───

/** Expo Push Token 저장 */
export async function savePushToken(token: string): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    await setDoc(
      doc(db, 'users', uid),
      { expoPushToken: token, notificationEnabled: true, lastActiveAt: new Date().toISOString() },
      { merge: true },
    );
  } catch (e) {
    console.warn('[Firebase] Push Token 저장 실패:', e);
  }
}

/** 알림 ON/OFF 설정 저장 */
export async function updateNotificationEnabled(
  enabled: boolean,
): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    await setDoc(
      doc(db, 'users', uid),
      { notificationEnabled: enabled },
      { merge: true },
    );
  } catch (e) {
    console.warn('[Firebase] 알림 설정 저장 실패:', e);
  }
}

// ─── Firestore CRUD ───

function userItemsCol(uid: string) {
  return collection(db, 'users', uid, 'items');
}

/** Firestore에 상품 저장 */
export async function saveItemToFirestore(item: TrackedItem): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    await setDoc(doc(db, 'users', uid, 'items', item.id), item);
  } catch (e) {
    console.warn('[Firebase] 상품 저장 실패:', e);
  }
}

/** Firestore에서 상품 삭제 */
export async function removeItemFromFirestore(itemId: string): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    await deleteDoc(doc(db, 'users', uid, 'items', itemId));
  } catch (e) {
    console.warn('[Firebase] 상품 삭제 실패:', e);
  }
}

/** Firestore에서 상품 목록 불러오기 */
export async function fetchItemsFromFirestore(): Promise<TrackedItem[]> {
  const uid = getCurrentUid();
  if (!uid) return [];

  try {
    const q = query(userItemsCol(uid), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as TrackedItem);
  } catch (e) {
    console.warn('[Firebase] 상품 목록 조회 실패:', e);
    return [];
  }
}

/** Firestore 상품 업데이트 (부분) */
export async function updateItemInFirestore(
  itemId: string,
  data: Partial<TrackedItem>
): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), data);
  } catch (e) {
    console.warn('[Firebase] 상품 업데이트 실패:', e);
  }
}

/** 로컬 전체 데이터를 Firestore에 백업 */
export async function syncLocalToFirestore(
  items: TrackedItem[]
): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    const batch = writeBatch(db);

    // lastActiveAt 업데이트
    batch.set(doc(db, 'users', uid), { lastActiveAt: new Date().toISOString() }, { merge: true });

    for (const item of items) {
      batch.set(doc(db, 'users', uid, 'items', item.id), item);
    }

    await batch.commit();
  } catch (e) {
    console.warn('[Firebase] 동기화 실패:', e);
  }
}

// ──────────────────────────────────────────────────────────
// Phase 3-A: shared_products / tracked / favorites CRUD
// docs/017_앱구조개편_Phase3.md §8-2
// 기존 items 경로 함수는 무수정 (하위 호환 유지)
// ──────────────────────────────────────────────────────────

/**
 * shared_products/{productId} 업서트 (merge)
 *
 * ⚠️ 시그니처를 Partial로 완화한 이유:
 * - trackerCount/favoriteCount는 increment()로만 관리 → 절대 이 경로로 쓰지 말 것
 * - priceHistory/lowestPrice/highestPrice는 서버(Phase 3-C)가 관리
 * - 클라이언트는 메타데이터(url, productName, thumbnail, currentPrice 등)만 기록
 */
export async function upsertSharedProduct(
  product: Partial<SharedProduct> & { productId: string },
): Promise<void> {
  try {
    const { productId, ...rest } = product;
    const ref = doc(db, 'shared_products', productId);
    const snap = await getDoc(ref);
    const isNew = !snap.exists();
    await setDoc(
      ref,
      { productId, ...rest, ...(isNew ? { createdAt: Date.now() } : {}) },
      { merge: true },
    );
    console.log('[shared] upsert', productId, isNew ? '(new)' : '(merge)');
  } catch (e) {
    console.warn('[Firebase] shared_products upsert 실패:', e);
  }
}

/**
 * TrackedItem → SharedProduct 변환 헬퍼 (클라이언트 쓰기 전용)
 *
 * productId 없으면 null 반환 (shared_products 스킵).
 * 카운터 / priceHistory / lowest·highestPrice 는 의도적으로 제외.
 */
export function trackedItemToSharedProduct(
  item: TrackedItem,
): (Partial<SharedProduct> & { productId: string }) | null {
  if (!item.productId) return null;
  return {
    productId: item.productId,
    url: item.url,
    resolvedUrl: item.resolvedUrl ?? item.url,
    ...(item.vendorItemId ? { vendorItemId: item.vendorItemId } : {}),
    productName: item.productName,
    thumbnail: item.thumbnail,
    currentPrice: item.currentPrice,
    lastCheckedAt: Date.now(),
  };
}

/** shared_products/{productId} 단건 조회 */
export async function getSharedProduct(
  productId: string,
): Promise<SharedProduct | null> {
  try {
    const snap = await getDoc(doc(db, 'shared_products', productId));
    if (!snap.exists()) return null;
    return snap.data() as SharedProduct;
  } catch (e) {
    console.warn('[Firebase] shared_products 조회 실패:', e);
    return null;
  }
}

/** trackerCount 원자적 증감 (+1 / -1) */
export async function incrementTrackerCount(
  productId: string,
  delta: number,
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'shared_products', productId),
      { trackerCount: increment(delta) },
      { merge: true },
    );
    console.log('[shared] trackerCount', productId, delta > 0 ? '+' : '', delta);
  } catch (e) {
    console.warn('[Firebase] trackerCount 증감 실패:', e);
  }
}

/** favoriteCount 원자적 증감 (+1 / -1) */
export async function incrementFavoriteCount(
  productId: string,
  delta: number,
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'shared_products', productId),
      { favoriteCount: increment(delta) },
      { merge: true },
    );
    console.log('[shared] favoriteCount', productId, delta > 0 ? '+' : '', delta);
  } catch (e) {
    console.warn('[Firebase] favoriteCount 증감 실패:', e);
  }
}

/** users/{uid}/tracked/{productId} 추가 (targetPrice 선택) */
export async function addTrackedRef(
  uid: string,
  productId: string,
  targetPrice?: number,
): Promise<void> {
  try {
    const ref: TrackedRef = {
      productId,
      ...(targetPrice !== undefined ? { targetPrice } : {}),
      addedAt: Date.now(),
    };
    await setDoc(doc(db, 'users', uid, 'tracked', productId), ref);
    console.log('[tracked] add', uid, productId);
  } catch (e) {
    console.warn('[Firebase] tracked ref 추가 실패:', e);
  }
}

/** users/{uid}/tracked/{productId} 삭제 */
export async function removeTrackedRef(
  uid: string,
  productId: string,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'tracked', productId));
    console.log('[tracked] remove', uid, productId);
  } catch (e) {
    console.warn('[Firebase] tracked ref 삭제 실패:', e);
  }
}

/** users/{uid}/favorites/{productId} 추가 */
export async function addFavoriteRef(
  uid: string,
  productId: string,
): Promise<void> {
  try {
    const ref: FavoriteRef = {
      productId,
      addedAt: Date.now(),
    };
    await setDoc(doc(db, 'users', uid, 'favorites', productId), ref);
    console.log('[favorites] add', uid, productId);
  } catch (e) {
    console.warn('[Firebase] favorites ref 추가 실패:', e);
  }
}

/** users/{uid}/favorites/{productId} 삭제 */
export async function removeFavoriteRef(
  uid: string,
  productId: string,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'favorites', productId));
    console.log('[favorites] remove', uid, productId);
  } catch (e) {
    console.warn('[Firebase] favorites ref 삭제 실패:', e);
  }
}

/** users/{uid}/favorites/{productId} 존재 여부 단건 조회 */
export async function hasFavoriteRef(
  uid: string,
  productId: string,
): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'favorites', productId));
    return snap.exists();
  } catch (e) {
    console.warn('[Firebase] favorites ref 조회 실패:', e);
    return false;
  }
}

// ──────────────────────────────────────────────────────────
// Phase 3-D: 실시간 구독 래퍼 (favorites.tsx / feed.tsx 용)
// ──────────────────────────────────────────────────────────

/**
 * 현재 uid 변경 구독. 인증 상태 변화 시 callback 호출.
 * 마운트 직후 현재 상태로 즉시 fire됨 (onAuthStateChanged 동작).
 */
export function subscribeAuthUid(
  callback: (uid: string | null) => void,
): () => void {
  return onAuthStateChanged(auth, (user) => {
    callback(user?.uid ?? null);
  });
}

/**
 * users/{uid}/favorites 실시간 구독 (addedAt 내림차순).
 * Unsubscribe 함수 반환.
 */
export function subscribeFavorites(
  uid: string,
  callback: (favorites: FavoriteRef[]) => void,
): () => void {
  const q = query(
    collection(db, 'users', uid, 'favorites'),
    orderBy('addedAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const refs = snapshot.docs.map((d) => d.data() as FavoriteRef);
      callback(refs);
    },
    (error) => {
      console.warn('[favorites] subscribe 실패:', error);
    },
  );
}

/**
 * price_drops 실시간 구독 (최근 windowHours, 최대 maxItems건).
 *
 * 쿼리: where(createdAt > cutoff) + orderBy(createdAt desc) — 단일 필드 자동 인덱스로 충분.
 * 정렬 보강(dropRate 오름차순)은 클라이언트에서 처리 → 복합 인덱스 불필요.
 */
export function subscribePriceDrops(
  callback: (drops: PriceDrop[]) => void,
  maxItems: number = 50,
  windowHours: number = 24,
): () => void {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const q = query(
    collection(db, 'price_drops'),
    where('createdAt', '>', cutoff),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const drops = snapshot.docs.map((d) => d.data() as PriceDrop);
      callback(drops);
    },
    (error) => {
      console.warn('[price_drops] subscribe 실패:', error);
      callback([]);
    },
  );
}

// ──────────────────────────────────────────────────────────
// docs/019_Phase3_SharedProducts.md §3-1 — 카테고리 베스트
// ──────────────────────────────────────────────────────────

/** category_best/{categoryId} 단건 조회 */
export async function getCategoryBest(
  categoryId: number,
): Promise<CategoryBest | null> {
  try {
    const snap = await getDoc(doc(db, 'category_best', String(categoryId)));
    if (!snap.exists()) return null;
    return snap.data() as CategoryBest;
  } catch (e) {
    console.warn('[category_best] 조회 실패:', categoryId, e);
    return null;
  }
}

/**
 * category_best 전체 1회 조회 (피드 탭용).
 * displayOrder 오름차순 정렬. 카테고리 19개 × ~50KB = ~950KB 페이로드.
 */
export async function fetchAllCategoryBest(): Promise<CategoryBest[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'category_best'),
        orderBy('displayOrder', 'asc'),
      ),
    );
    return snap.docs.map((d) => d.data() as CategoryBest);
  } catch (e) {
    console.warn('[category_best] 전체 조회 실패:', e);
    return [];
  }
}

/**
 * category_best/{categoryId} 실시간 구독.
 * 문서 미존재 시 null 콜백. Unsubscribe 함수 반환.
 */
export function subscribeCategoryBest(
  categoryId: number,
  callback: (data: CategoryBest | null) => void,
): () => void {
  return onSnapshot(
    doc(db, 'category_best', String(categoryId)),
    (snap) => {
      callback(snap.exists() ? (snap.data() as CategoryBest) : null);
    },
    (error) => {
      console.warn('[category_best] subscribe 실패:', categoryId, error);
      callback(null);
    },
  );
}

// ──────────────────────────────────────────────────────────
// 업데이트 알림 (meta/config_jigumiya)
// ──────────────────────────────────────────────────────────

/**
 * meta/config_jigumiya 단건 조회 — 인증 없이 호출 가능 (rules: read if true).
 * 미존재/실패 시 null. updateChecker.ts에서 호출.
 */
export async function getMetaConfig(): Promise<MetaConfig | null> {
  try {
    const snap = await getDoc(doc(db, 'meta', 'config_jigumiya'));
    if (!snap.exists()) return null;
    return snap.data() as MetaConfig;
  } catch (e) {
    console.warn('[meta/config] 조회 실패:', e);
    return null;
  }
}
