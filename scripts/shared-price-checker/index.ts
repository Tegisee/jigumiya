/**
 * shared-price-checker — shared_products 풀 기반 가격 체크 cron (docs/019 §5-2)
 *
 * 정책:
 *   - 실행: 매일 04:30 ~ 01:00 KST (20.5h, GitHub Actions 6h 한도 내 실제론 더 짧게 종료)
 *   - 호출 속도: 분당 최대 40회 = sleep 1500ms (공식 한도 50회 80% 마진)
 *   - 순서: shared_products 전체 fetch → createdAt asc 정렬 (없는 문서는 뒤로)
 *   - 스킵 조건:
 *       ① trackerCount === 0 (019 §4-4 정리 대상)
 *       ② createdAt이 오늘 KST 자정 이후 (당일 추가 — 다음날 회차 편입)
 *   - category_best 캐시 hit + 신선도 + 30% 가드 통과 시 API 호출 스킵 (019 §4-2)
 *   - rate-limited 응답 감지 시 즉시 종료 (당일 재실행 없음, 019 §4-1 비고)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { fetchCurrentPrice, type FetchPriceResult } from './coupang-api.js';
import {
  sendSmartNotifications,
  type SmartPushTarget,
  type AlertType,
} from './notifier.js';
import {
  loadCategoryBestCache,
  isCacheStablePrice,
} from './category-best-cache.js';
import { recordPriceDrop } from './price-drop.js';

// ─── 설정 ───
const SLEEP_MS = 1500; // 분당 40회 (공식 한도 50회의 80%)
const KST_OFFSET = 9 * 3600 * 1000;
const PRICE_HISTORY_KEEP = 90;

// ─── Firebase Admin 초기화 ───
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── 유틸 ───

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 오늘 KST 자정 ms epoch — 러너는 UTC라 직접 계산 */
function todayKstMidnight(): number {
  const now = Date.now();
  return Math.floor((now + KST_OFFSET) / 86400_000) * 86400_000 - KST_OFFSET;
}

interface SharedDoc {
  ref: DocumentReference;
  data: DocumentData;
}

/** shared_products 전체 fetch + createdAt asc 정렬 (없는 문서는 뒤로) */
async function fetchAllSharedProducts(): Promise<SharedDoc[]> {
  const snap = await db.collection('shared_products').get();
  const docs: SharedDoc[] = snap.docs.map((d) => ({
    ref: d.ref,
    data: d.data(),
  }));
  docs.sort((a, b) => {
    const ca =
      (a.data.createdAt as number | undefined) ?? Number.MAX_SAFE_INTEGER;
    const cb =
      (b.data.createdAt as number | undefined) ?? Number.MAX_SAFE_INTEGER;
    return ca - cb;
  });
  return docs;
}

interface TrackerInfo {
  uid: string;
  targetPrice?: number;
  expoPushToken?: string;
  notificationEnabled: boolean;
}

/** collectionGroup('tracked').where('productId','==',pid) → user 메타와 결합 */
async function fetchTrackers(productId: string): Promise<TrackerInfo[]> {
  const snap = await db
    .collectionGroup('tracked')
    .where('productId', '==', productId)
    .get();
  const trackers: TrackerInfo[] = [];
  for (const docSnap of snap.docs) {
    // 경로: users/{uid}/tracked/{productId}
    const uid = docSnap.ref.parent.parent?.id;
    if (!uid) continue;
    const targetPrice = docSnap.data().targetPrice as number | undefined;
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) continue;
    const u = userSnap.data() ?? {};
    trackers.push({
      uid,
      targetPrice,
      expoPushToken: u.expoPushToken as string | undefined,
      notificationEnabled: u.notificationEnabled !== false,
    });
  }
  return trackers;
}

/** 알림 종류 결정 — 무변동/상승은 본 cron에서 미발송 */
function decideAlertType(
  newPrice: number,
  prevPrice: number,
  lowestPrice: number,
  targetPrice?: number,
): AlertType | null {
  if (targetPrice && targetPrice > 0 && newPrice <= targetPrice) {
    return 'target_reached';
  }
  if (newPrice < prevPrice) {
    if (newPrice <= lowestPrice) {
      return targetPrice && targetPrice > 0
        ? 'lowest_ever'
        : 'lowest_no_target';
    }
    return 'price_drop';
  }
  return null;
}

/** Expo DeviceNotRegistered 토큰 cleanup — users/{uid}.expoPushToken만 제거 */
async function cleanupInvalidTokens(invalidTokens: string[]) {
  if (invalidTokens.length === 0) return;
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const token = userDoc.data().expoPushToken;
    if (!token || !invalidTokens.includes(token)) continue;
    console.log(`[Cleanup] 만료 토큰 제거: ${userDoc.id}`);
    await userDoc.ref.update({
      expoPushToken: FieldValue.delete(),
      notificationEnabled: false,
    });
  }
}

// ─── 메인 ───

async function main() {
  const startedAt = Date.now();
  const cutoff = todayKstMidnight();
  console.log(
    '[SharedPriceChecker] 시작:',
    new Date(startedAt).toISOString(),
    'todayKstMidnight:',
    new Date(cutoff).toISOString(),
  );

  const bestCache = await loadCategoryBestCache(db);
  console.log(
    `[SharedPriceChecker] category_best 캐시 ${bestCache.size}개 로드`,
  );

  const all = await fetchAllSharedProducts();
  console.log(`[SharedPriceChecker] shared_products 풀 ${all.length}개`);

  const pushTargets: SmartPushTarget[] = [];
  let scanned = 0;
  let skipZero = 0;
  let skipToday = 0;
  let cacheHits = 0;
  let apiCalls = 0;
  let priceDrops = 0;
  let rateLimited = false;

  for (const item of all) {
    scanned++;
    const data = item.data;
    const productId = data.productId as string | undefined;
    const productName = data.productName as string | undefined;
    if (!productId || !productName) continue;

    const trackerCount = Number(data.trackerCount || 0);
    if (trackerCount === 0) {
      skipZero++;
      continue;
    }

    const createdAt = data.createdAt as number | undefined;
    if (createdAt && createdAt >= cutoff) {
      skipToday++;
      console.log(
        `[Skip-Today] ${productId} (createdAt=${new Date(createdAt).toISOString()})`,
      );
      continue;
    }

    const prevPrice = Number(data.currentPrice || 0);
    let newPrice = 0;
    let usedCache = false;

    const cached = bestCache.get(productId);
    if (cached && isCacheStablePrice(cached.price, prevPrice)) {
      console.log(
        `[${scanned}] ${productId} ${productName.slice(0, 30)} → cache hit ${cached.price}`,
      );
      newPrice = cached.price;
      usedCache = true;
      cacheHits++;
    } else {
      console.log(
        `[${scanned}] ${productId} ${productName.slice(0, 30)} → API`,
      );
      const r: FetchPriceResult = await fetchCurrentPrice(
        productName,
        productId,
        prevPrice,
      );
      apiCalls++;
      if (!r.ok) {
        if (r.rateLimited) {
          console.warn(
            '[SharedPriceChecker] rate-limited 감지 — 즉시 종료 (당일 재실행 없음)',
          );
          rateLimited = true;
          break;
        }
        await sleep(SLEEP_MS);
        continue;
      }
      newPrice = r.price;
      await sleep(SLEEP_MS);
    }

    if (newPrice <= 0) continue;

    // priceHistory: 같은 날 갱신은 덮어쓰기, 새 날은 append. 최근 90일만 유지.
    const today = new Date().toISOString().slice(0, 10);
    const history: { date: string; price: number }[] = data.priceHistory || [];
    const last = history[history.length - 1];
    if (!last || last.date !== today) {
      history.push({ date: today, price: newPrice });
    } else {
      last.price = newPrice;
    }
    const trimmed = history.slice(-PRICE_HISTORY_KEEP);

    const lowestPrice = Math.min(
      Number(data.lowestPrice || newPrice),
      newPrice,
    );
    const highestPrice = Math.max(
      Number(data.highestPrice || newPrice),
      newPrice,
    );

    await item.ref.update({
      currentPrice: newPrice,
      priceHistory: trimmed,
      lowestPrice,
      highestPrice,
      lastCheckedAt: Date.now(),
    });

    console.log(
      `  → ${prevPrice.toLocaleString()}원 → ${newPrice.toLocaleString()}원${usedCache ? ' (cache)' : ''}`,
    );

    if (newPrice < prevPrice) {
      await recordPriceDrop(
        db,
        productId,
        productName,
        (data.thumbnail as string | undefined) || '',
        prevPrice,
        newPrice,
        trackerCount,
      );
      priceDrops++;
    }

    // 추적자별 알림 대상 수집
    const trackers = await fetchTrackers(productId);
    for (const t of trackers) {
      if (!t.expoPushToken || !t.notificationEnabled) continue;
      const alertType = decideAlertType(
        newPrice,
        prevPrice,
        lowestPrice,
        t.targetPrice,
      );
      if (!alertType) continue;
      pushTargets.push({
        token: t.expoPushToken,
        itemId: productId,
        productName,
        alertType,
        currentPrice: newPrice,
        previousPrice: prevPrice,
        targetPrice: t.targetPrice ?? 0,
        lowestPrice,
        noChangeDays: 0,
      });
    }
  }

  console.log(`[SharedPriceChecker] 알림 대상 ${pushTargets.length}건`);
  const invalidTokens = await sendSmartNotifications(pushTargets);
  await cleanupInvalidTokens(invalidTokens);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[SharedPriceChecker] 완료 ` +
      `scanned=${scanned} skipZero=${skipZero} skipToday=${skipToday} ` +
      `cacheHits=${cacheHits} apiCalls=${apiCalls} drops=${priceDrops} ` +
      `notif=${pushTargets.length} rateLimited=${rateLimited} elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error('[SharedPriceChecker] FATAL:', e);
  process.exit(1);
});
