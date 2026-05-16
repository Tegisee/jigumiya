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
  documentId,
  where,
  limit,
  writeBatch,
  increment,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  getCountFromServer,
  deleteField,
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
  EventBestJigumiya,
  CoupangPLDoc,
  GoldboxDoc,
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
  | {
      ok: true;
      shortenUrl: string;
      originalUrl: string;
      // 1.0.19 §1 — Functions가 vp HTML OG 태그에서 best-effort 파싱한 메타데이터.
      // 추출 실패 시 빈 문자열/0 또는 undefined. 상품 추가 INIT 상태에서만 사용.
      productName?: string;
      productImage?: string;
      apiPrice?: number;
    }
  | { ok: false; error: string; detail?: string };

const resolveAffiliateCallable = httpsCallable<
  { sharedUrl: string },
  ResolveAffiliateResult
>(functions, 'resolveAndGenerateAffiliateUrl');

/**
 * Auth 복원 대기 — currentUser가 있거나 maxMs 경과까지.
 *
 * iOS 첫 실행 직후 add-item 모달 진입 시 AsyncStorage 복원이 아직이면
 * Functions 호출이 인증 없이 즉시 실패 → 8s timeout 후 fallback이 발동되어
 * 사용자에겐 "무한로딩"처럼 느껴짐. 짧게 기다려서 인증 정상화 시 Functions 정상 경로 사용.
 */
async function waitForAuthReady(maxMs: number): Promise<boolean> {
  if (auth.currentUser) return true;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(ok);
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) finish(true);
    });
    const timer = setTimeout(() => finish(false), maxMs);
  });
}

/**
 * Cloud Functions `resolveAndGenerateAffiliateUrl` 호출.
 * 서버가 link.coupang.com → vp URL resolve + /deeplink API 호출까지 일괄 처리.
 * 네트워크/배포 오류 시 { ok: false, error: 'callable_error' } 반환 — 예외는 내부 흡수.
 *
 * iOS 첫 1~2번째 상품 추가 무한로딩 fix: 인증 미준비 시 1.5s 대기 후 그래도 미준비면
 * 즉시 fallback 신호 반환 (8s Functions timeout을 기다리지 않음).
 */
export async function callResolveAffiliate(
  sharedUrl: string,
): Promise<ResolveAffiliateResult> {
  const ready = await waitForAuthReady(1500);
  if (!ready) {
    return { ok: false, error: 'auth_not_ready' };
  }
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

// sentinel은 functions/src/index.ts:256에서 coupang.com 미포함 시 즉시 early return →
// 쿠팡 API 미호출(Rate Limit 0), 컨테이너 init만 트리거.
export async function warmupResolveAffiliate(): Promise<void> {
  const ready = await waitForAuthReady(1500);
  if (!ready) return; // 인증 없으면 Functions가 거부 → cold-start 트리거 안 됨
  try {
    await resolveAffiliateCallable({ sharedUrl: 'https://__warmup__.local/' });
  } catch {
    // silent — cold start만 트리거하면 됨
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

/**
 * users/{uid} doc 무조건 생성 보장 — signInAnonymously 직후 호출.
 *
 * 5/6 갤럭시S21+ 알림 0건 사고 fix:
 * 기존엔 savePushToken만이 user doc 생성처라 알림 권한 거부 / getExpoPushTokenAsync 실패 시
 * doc 자체가 만들어지지 않음 → cron fetchActiveUsers에서 unknown으로 분류 → 발송 제외.
 * 권한/토큰 발급 결과와 무관하게 app 필드 + createdAt 박아 발송 대상 보장.
 *
 * createdAt은 신규 생성 시에만 기록 (기존 doc 보존).
 */
export async function ensureUserDoc(uid: string): Promise<void> {
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const isNew = !snap.exists();
    await setDoc(
      ref,
      {
        app: 'jigumiya' as const,
        platform: Platform.OS,
        ...(isNew ? { createdAt: serverTimestamp() } : {}),
      },
      { merge: true },
    );
    if (isNew) console.log('[Firebase] ensureUserDoc 신규 생성:', uid);
  } catch (e) {
    console.warn('[Firebase] ensureUserDoc 실패:', e);
  }
}

// ─── Push Token / 알림 설정 ───

/** Expo Push Token 저장 */
export async function savePushToken(token: string): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        expoPushToken: token,
        notificationEnabled: true,
        lastActiveAt: new Date().toISOString(),
        // C (2026-05-04): 알림 발송 시 앱 식별 — 서버는 app !== 'jigumiya' 사용자 스킵.
        // 5/3 batch 거절 사고: users 컬렉션에 다른 EAS projectId 토큰 혼재(아이고 등) → 차단.
        app: 'jigumiya' as const,
      },
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

/** users/{uid}/items/{itemId}에서 targetPrice 필드 자체를 unset */
export async function clearItemTargetPrice(itemId: string): Promise<void> {
  const uid = getCurrentUid();
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'users', uid, 'items', itemId), {
      targetPrice: deleteField(),
    });
  } catch (e) {
    console.warn('[Firebase] targetPrice 삭제 실패:', e);
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
 * ⚠️ 책임 분담 (1.0.20 docs/026):
 * - trackerCount/favoriteCount: increment()로만 관리 → 절대 이 경로로 쓰지 말 것
 * - priceHistory/lowestPrice/highestPrice/apiPrice/lastCheckedAt: 서버(cron) 전용
 * - 클라이언트는 메타데이터(url, productName, thumbnail, vendorItemId) + 최초 currentPrice 시드만 기록
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
 * 상품명 invalid 판정 — shared_products write 가드 + addItem 머지 분기 공용.
 *
 * invalid 3종:
 *   1. 빈 문자열 / 공백만
 *   2. "쿠팡(을) (X) 추천(X) 합니다(X) !?" 등 갤럭시/iOS 공유 시 자동 삽입 문구
 *      (parseProductName 정규식과 동일 패턴 — `쿠팡을?\s*추천\s*합니다!?`)
 *   3. "상품 정보 없음" — 앱이 생성한 placeholder (add-item.tsx handleSave fallback)
 */
export function isInvalidProductName(name: string | undefined | null): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (trimmed.length === 0) return true;
  if (trimmed === '상품 정보 없음') return true;
  if (/^쿠팡을?\s*추천\s*합니다!?$/.test(trimmed)) return true;
  return false;
}

/**
 * TrackedItem → SharedProduct 변환 헬퍼 (클라이언트 쓰기 전용)
 *
 * 반환 null 케이스 (shared_products 스킵 = dead 문서 생성 방지):
 *   - productId 없음
 *   - productName invalid (isInvalidProductName 참조)
 *   - thumbnail 빈 값
 *
 * 카운터 / priceHistory / lowest·highestPrice 는 의도적으로 제외.
 *
 * 1.0.20 (docs/026): 신규 추가의 currentPrice는 Functions/searchProducts에서 받은 apiPrice 값 →
 * apiPrice 시드. 기존 shared 문서 있으면 setDoc(merge)로 cron 값이 우세.
 */
export function trackedItemToSharedProduct(
  item: TrackedItem,
): (Partial<SharedProduct> & { productId: string }) | null {
  if (!item.productId) return null;
  if (isInvalidProductName(item.productName)) return null;
  if (!item.thumbnail) return null;
  const now = Date.now();
  return {
    productId: item.productId,
    url: item.url,
    resolvedUrl: item.resolvedUrl ?? item.url,
    ...(item.vendorItemId ? { vendorItemId: item.vendorItemId } : {}),
    productName: item.productName,
    thumbnail: item.thumbnail,
    currentPrice: item.currentPrice,
    ...(item.currentPrice > 0 ? { apiPrice: item.currentPrice } : {}),
    lastCheckedAt: now,
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

/**
 * shared_products/{productId} 다건 조회 — Issue 1 (2026-05-10).
 *
 * cron(`shared-price-checker`)이 `shared_products.priceHistory`를 매 사이클 누적하지만
 * 앱은 `users/{uid}/items`만 read해서 그래프가 영원히 안 바뀌던 문제 fix.
 * `syncFromFirestore`가 본 함수로 productId별 shared 본을 read해서 머지에 사용.
 *
 * 호출량: 추적 N ≤ `MAX_TRACKED_ITEMS` (1.0.17 기준 20)이라 Promise.all로 1 round-trip.
 */
export async function fetchSharedProductsByIds(
  productIds: string[],
): Promise<Map<string, SharedProduct>> {
  const out = new Map<string, SharedProduct>();
  const validIds = productIds.filter((id): id is string => !!id);
  if (validIds.length === 0) return out;

  try {
    const snaps = await Promise.all(
      validIds.map((id) => getDoc(doc(db, 'shared_products', id))),
    );
    snaps.forEach((snap, i) => {
      if (snap.exists()) {
        out.set(validIds[i], snap.data() as SharedProduct);
      }
    });
  } catch (e) {
    console.warn('[Firebase] shared_products 다건 조회 실패:', e);
  }
  return out;
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

/**
 * 1.0.20 (docs/026 #11): trackerCount=0 + favoriteCount=0이면 shared_products 문서 즉시 삭제.
 * cron rate limit + Firestore 비용 절감. transaction으로 race 차단 — 다른 사용자가 동시에
 * 추가하는 경우 transaction이 retry되어 새 카운터를 보고 삭제 스킵.
 *
 * 가드:
 *   - trackerCount > 0: 다른 사용자가 추적 중 → 보존
 *   - favoriteCount > 0: 자주사는 사용자 보호 → 보존
 *   - 문서 미존재: noop
 */
export async function deleteSharedIfOrphan(productId: string): Promise<void> {
  try {
    const ref = doc(db, 'shared_products', productId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const trackerCount = Number(data.trackerCount ?? 0);
      const favoriteCount = Number(data.favoriteCount ?? 0);
      if (trackerCount <= 0 && favoriteCount <= 0) {
        tx.delete(ref);
      }
    });
    console.log('[shared] deleteIfOrphan checked', productId);
  } catch (e) {
    console.warn('[Firebase] deleteSharedIfOrphan 실패:', productId, e);
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
 *
 * 8초 타임아웃: iOS 쿠팡 복귀 시 Firestore 채널이 idle stall 걸려도 무한로딩 방지.
 * 타임아웃 시 빈 배열 반환 (호출 측에서 재시도 트리거).
 */
export async function fetchAllCategoryBest(): Promise<CategoryBest[]> {
  try {
    const fetchPromise = getDocs(
      query(
        collection(db, 'category_best'),
        orderBy('displayOrder', 'asc'),
      ),
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('fetchAllCategoryBest timeout 8s')), 8000),
    );
    const snap = await Promise.race([fetchPromise, timeoutPromise]);
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
// 이벤트 베스트 (event_best_jigumiya) + 쿠팡 PL (coupang_pl)
// ──────────────────────────────────────────────────────────

/** KST 기준 오늘 'YYYY-MM-DD' */
function todayKstDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 오늘 KST 기준 D-7 이내(오늘 포함) 가장 가까운 이벤트 1건 반환.
 * cron(02:35 KST)이 D-7 윈도우에서만 갱신하므로 products 비어있는 stale 문서 가능 → 빈 products 제외.
 */
export async function fetchActiveJigumiyaEvent(): Promise<{
  event: EventBestJigumiya;
  daysUntil: number;
} | null> {
  try {
    const snap = await getDocs(collection(db, 'event_best_jigumiya'));
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayY = kst.getUTCFullYear();
    const todayMidnight = Date.UTC(
      todayY,
      kst.getUTCMonth(),
      kst.getUTCDate(),
    );

    let best: { event: EventBestJigumiya; daysUntil: number } | null = null;
    for (const d of snap.docs) {
      const ev = d.data() as EventBestJigumiya;
      if (!ev?.date || !ev?.products?.length) continue;
      const [mm, dd] = ev.date.split('-').map(Number);
      if (!mm || !dd) continue;

      let evMidnight = Date.UTC(todayY, mm - 1, dd);
      let diffDays = Math.round((evMidnight - todayMidnight) / 86400000);
      // 이미 지났으면 내년 동일일 기준 (D-7 안 들어옴 — best 후보 제외)
      if (diffDays < 0) {
        evMidnight = Date.UTC(todayY + 1, mm - 1, dd);
        diffDays = Math.round((evMidnight - todayMidnight) / 86400000);
      }
      if (diffDays > 7) continue;
      if (!best || diffDays < best.daysUntil) {
        best = { event: ev, daysUntil: diffDays };
      }
    }
    return best;
  } catch (e) {
    console.warn('[event_best_jigumiya] 활성 이벤트 조회 실패:', e);
    return null;
  }
}

/**
 * event_best_jigumiya/{slug} 단건 조회 (event-best 화면용).
 */
export async function fetchEventBySlug(
  slug: string,
): Promise<EventBestJigumiya | null> {
  try {
    const snap = await getDoc(doc(db, 'event_best_jigumiya', slug));
    if (!snap.exists()) return null;
    return snap.data() as EventBestJigumiya;
  } catch (e) {
    console.warn('[event_best_jigumiya] slug 조회 실패:', slug, e);
    return null;
  }
}

/**
 * 오늘 KST 'YYYY-MM-DD' 골드박스 문서 조회.
 * 미존재 시 어제 문서 fallback (cron 지연/실패 흡수).
 */
export async function fetchGoldboxToday(): Promise<GoldboxDoc | null> {
  const todayStr = todayKstDateString();
  try {
    const todaySnap = await getDoc(doc(db, 'goldbox', todayStr));
    if (todaySnap.exists()) return todaySnap.data() as GoldboxDoc;
    const yest = new Date(Date.now() + 9 * 60 * 60 * 1000 - 86400000);
    const yestStr = `${yest.getUTCFullYear()}-${String(yest.getUTCMonth() + 1).padStart(2, '0')}-${String(yest.getUTCDate()).padStart(2, '0')}`;
    const yestSnap = await getDoc(doc(db, 'goldbox', yestStr));
    if (yestSnap.exists()) return yestSnap.data() as GoldboxDoc;
    return null;
  } catch (e) {
    console.warn('[goldbox] 조회 실패:', e);
    return null;
  }
}

/**
 * 오늘 KST 'YYYY-MM-DD' 쿠팡 PL 문서 조회.
 * 미존재 시 어제 문서 fallback (cron 지연/실패 흡수).
 */
export async function fetchCoupangPLToday(): Promise<CoupangPLDoc | null> {
  const todayStr = todayKstDateString();
  try {
    const todaySnap = await getDoc(doc(db, 'coupang_pl', todayStr));
    if (todaySnap.exists()) return todaySnap.data() as CoupangPLDoc;
    // fallback: 어제
    const yest = new Date(Date.now() + 9 * 60 * 60 * 1000 - 86400000);
    const yestStr = `${yest.getUTCFullYear()}-${String(yest.getUTCMonth() + 1).padStart(2, '0')}-${String(yest.getUTCDate()).padStart(2, '0')}`;
    const yestSnap = await getDoc(doc(db, 'coupang_pl', yestStr));
    if (yestSnap.exists()) return yestSnap.data() as CoupangPLDoc;
    return null;
  } catch (e) {
    console.warn('[coupang_pl] 조회 실패:', e);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// 업데이트 알림 (meta/config_jigumiya)
// ──────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────
// 관리자 모드 (docs/023 §관리자 기기 설계)
// ──────────────────────────────────────────────────────────

/**
 * users/{uid}.isAdmin 실시간 구독 — 설정 화면에서 진입 버튼 노출 판단.
 * doc 미존재 / 필드 미존재 / false → false 콜백. Unsubscribe 함수 반환.
 */
export function subscribeIsAdmin(
  uid: string,
  callback: (isAdmin: boolean) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      const data = snap.data() ?? {};
      callback(data.isAdmin === true);
    },
    (error) => {
      console.warn('[admin] isAdmin 구독 실패:', error);
      callback(false);
    },
  );
}

/**
 * shared_products 전체 fetch — 관리자 모드 자동 순회용 (documentId asc 정렬).
 * 정렬 기준이 일정해야 두 기기가 같은 인덱스로 분배됨.
 * doc.id === productId 이므로 documentId 정렬은 productId 정렬과 동일.
 * (이전 createdAt orderBy는 필드 누락 doc을 제외하는 버그가 있었음 — 1.0.16 fix)
 */
export async function fetchAllSharedProducts(): Promise<SharedProduct[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'shared_products'), orderBy(documentId(), 'asc')),
    );
    return snap.docs.map((d) => d.data() as SharedProduct);
  } catch (e) {
    console.warn('[admin] shared_products 전체 조회 실패:', e);
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// 관리자 통계 대시보드 (docs/026 #5)
// ──────────────────────────────────────────────────────────

export interface AdminStats {
  productStats: {
    total: number;
    withTrackers: number;
    avgTrackers: number;
  };
  priceStats: {
    drops24h: number;
    avgDropRate: number;
  };
  notifStats: {
    available: boolean;
    sentToday?: number;
    sentThisWeek?: number;
    lastSentAt?: number;
  };
  userStats: {
    total: number;
    active7d: number;
    withToken: number;
  };
  cronStats: {
    lastRunAt?: number;
    lastCheckedOffset?: number;
  };
}

/**
 * 관리자 통계 4섹션 일괄 조회. Promise.all로 병렬.
 * meta/notif_stats는 cron이 발송 시 누적 갱신 예정 — 현재 없으면 available=false로 graceful.
 */
export async function fetchAdminStats(): Promise<AdminStats> {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * ONE_DAY;
  const now = Date.now();

  const [products, drops24h, jigumiyaUsers, metaStats, notifStats] =
    await Promise.all([
      // shared_products full fetch — 100~수백 문서라 비용 부담 없음
      getDocs(collection(db, 'shared_products')).catch((e) => {
        console.warn('[admin/stats] shared_products fetch 실패:', e);
        return null;
      }),
      // price_drops 24h
      getDocs(
        query(
          collection(db, 'price_drops'),
          where('createdAt', '>', now - ONE_DAY),
        ),
      ).catch((e) => {
        console.warn('[admin/stats] price_drops fetch 실패:', e);
        return null;
      }),
      // users where(app=jigumiya)
      getDocs(
        query(collection(db, 'users'), where('app', '==', 'jigumiya')),
      ).catch((e) => {
        console.warn('[admin/stats] users fetch 실패:', e);
        return null;
      }),
      getDoc(doc(db, 'meta', 'stats')).catch((e) => {
        console.warn('[admin/stats] meta/stats fetch 실패:', e);
        return null;
      }),
      getDoc(doc(db, 'meta', 'notif_stats')).catch(() => null),
    ]);

  // 1. productStats
  let totalProducts = 0;
  let withTrackers = 0;
  let trackerSum = 0;
  if (products) {
    totalProducts = products.size;
    for (const d of products.docs) {
      const tc = Number(d.data().trackerCount ?? 0);
      if (tc > 0) {
        withTrackers++;
        trackerSum += tc;
      }
    }
  }
  const avgTrackers = withTrackers > 0 ? trackerSum / withTrackers : 0;

  // 2. priceStats — 24h drops + avg dropRate (음수)
  let dropsCount = 0;
  let dropRateSum = 0;
  if (drops24h) {
    dropsCount = drops24h.size;
    for (const d of drops24h.docs) {
      const r = Number(d.data().dropRate ?? 0);
      if (r < 0) dropRateSum += r;
    }
  }
  const avgDropRate = dropsCount > 0 ? dropRateSum / dropsCount : 0;

  // 3. userStats — 활성(lastActiveAt 7d 이내) + 토큰 보유
  let totalUsers = 0;
  let active7d = 0;
  let withToken = 0;
  if (jigumiyaUsers) {
    totalUsers = jigumiyaUsers.size;
    for (const u of jigumiyaUsers.docs) {
      const data = u.data();
      const lastActiveStr = data.lastActiveAt as string | undefined;
      const lastActiveMs = lastActiveStr ? Date.parse(lastActiveStr) : 0;
      if (lastActiveMs > 0 && now - lastActiveMs < SEVEN_DAYS) active7d++;
      if (data.expoPushToken) withToken++;
    }
  }

  // 4. cronStats
  const cronData = metaStats?.exists() ? metaStats.data() : null;
  const cronStats = {
    lastRunAt: cronData?.lastRunAt as number | undefined,
    lastCheckedOffset: cronData?.lastCheckedOffset as number | undefined,
  };

  // 5. notifStats — 미존재 시 available=false
  if (notifStats?.exists()) {
    const data = notifStats.data();
    return {
      productStats: { total: totalProducts, withTrackers, avgTrackers },
      priceStats: { drops24h: dropsCount, avgDropRate },
      notifStats: {
        available: true,
        sentToday: Number(data.sentToday ?? 0),
        sentThisWeek: Number(data.sentThisWeek ?? 0),
        lastSentAt: data.lastSentAt as number | undefined,
      },
      userStats: { total: totalUsers, active7d, withToken },
      cronStats,
    };
  }

  return {
    productStats: { total: totalProducts, withTrackers, avgTrackers },
    priceStats: { drops24h: dropsCount, avgDropRate },
    notifStats: { available: false },
    userStats: { total: totalUsers, active7d, withToken },
    cronStats,
  };
}

/** 의도된 unused import 회피 — getCountFromServer는 추후 N이 커지면 사용 (현재 full fetch). */
void getCountFromServer;

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
