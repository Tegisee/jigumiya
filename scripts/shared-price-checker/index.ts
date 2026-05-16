/**
 * shared-price-checker — shared_products 풀 기반 가격 체크 cron (docs/019 §5-2 + docs/026)
 *
 * 1.0.20 (docs/026): apiPrice 단일 출처. realPrice / priceStatus / needsCheck 폐기.
 * 알림 3종: price_drop_summary / target_reached / price_up_summary.
 *
 * 정책:
 *   - 실행: 매일 04:30 ~ 01:00 KST (cron schedule은 §8-D-2에서 확정)
 *   - 호출 속도: 분당 최대 30회 = sleep 2000ms (공식 한도 50회의 60% 마진)
 *   - 순서: shared_products 전체 fetch → createdAt asc 정렬
 *   - 스킵: trackerCount === 0 / 당일 추가 / category_best 캐시 hit
 *   - rate-limited 즉시 종료 (당일 재실행 없음, 019 §4-1)
 *
 * 24h 중복 방지: users/{uid}.lastNotifications 단일 map
 *   - priceDrop/priceUp/targetReached?: { [productId]: number }
 *
 * 모드:
 *   - 기본 (가격체크 모드): shared-price-check.yml. 가격 스캔 + flush
 *   - NOTIFY_ONLY=true (알림 전용): notify-only.yml. 가격 스캔 스킵, price_drops 24h 조회로 events.drops 재구성
 */

import { initializeApp, cert } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  type Firestore,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { fetchCurrentPrice, type FetchPriceResult } from './coupang-api.js';
import {
  sendSmartNotifications,
  type PushPayload,
  type ProductBrief,
} from './notifier.js';
import {
  loadCategoryBestCache,
  isCacheStablePrice,
} from './category-best-cache.js';
import { recordPriceDrop } from './price-drop.js';
import { processCategoryRoundRobin } from './category-cycle.js';

// ─── 설정 ───
const DEFAULT_SLEEP_MS = 2000; // 분당 24~30회 — 검색 한도 50/분의 48~60%
const DAILY_CAPACITY = 50_000; // 하루 처리 가능 상품 수 (분할 모드 진입 임계)
const MAX_CYCLES = 144; // 일일 최대 사이클 (10분에 1회 == 24h × 6) — cyclesPerDay 산출 용도만 잔존
const KST_OFFSET = 9 * 3600 * 1000;
const PRICE_HISTORY_KEEP = 90;
const ONE_DAY_MS = 24 * 3600 * 1000;
const NOTIFY_DROPRATE_GUARD_PCT = 60; // 절댓값 60% 초과는 검색 API 매칭 휴리스틱 오류로 간주, 알림 차단

// ─── §11 자동화 설계 — N값 기반 실행 타이밍 자동 결정 ───
// docs/020 §3 매트릭스 — [최대 N, 간격 분]. 오름차순 정렬 필수 (lookupBaseInterval 선형 탐색).
const INTERVAL_MATRIX: ReadonlyArray<readonly [number, number]> = [
  [400, 10],
  [600, 15],
  [800, 20],
  [1200, 30],
  [1800, 45],
  [2400, 60],
  [3600, 90],
  [4800, 120],
  [6000, 150],
  [7200, 180],
  [9600, 240],
  [13200, 330],
];
const PEAK_HOUR_START = 7;  // 07:00 KST 포함
const PEAK_HOUR_END = 23;   // 23:00 KST 미포함 (즉 22:59까지 피크)
const OFF_PEAK_MULTIPLIER = 2; // 비피크는 간격 ×2 (docs/020 §11)

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

/** 현재 KST 시각 (hour, minute) */
function getKstHourMinute(): { hour: number; minute: number } {
  const kst = new Date(Date.now() + KST_OFFSET);
  return { hour: kst.getUTCHours(), minute: kst.getUTCMinutes() };
}

function lookupBaseInterval(n: number): number {
  for (const [maxN, minutes] of INTERVAL_MATRIX) {
    if (n <= maxN) return minutes;
  }
  return INTERVAL_MATRIX[INTERVAL_MATRIX.length - 1][1];
}

function isPeakHour(hour: number): boolean {
  return hour >= PEAK_HOUR_START && hour < PEAK_HOUR_END;
}

function computeEffectiveInterval(n: number, hour: number): number {
  const base = lookupBaseInterval(n);
  return isPeakHour(hour) ? base : base * OFF_PEAK_MULTIPLIER;
}

async function readLastRunAt(): Promise<number> {
  try {
    const snap = await db.collection('meta').doc('stats').get();
    return (snap.data()?.lastRunAt as number | undefined) ?? 0;
  } catch (e) {
    console.warn('[Schedule] meta/stats.lastRunAt 읽기 실패 → 0', e);
    return 0;
  }
}

async function writeLastRunAt(at: number): Promise<void> {
  try {
    await db.collection('meta').doc('stats').set({ lastRunAt: at }, { merge: true });
  } catch (e) {
    console.warn('[Schedule] meta/stats.lastRunAt 갱신 실패:', e);
  }
}

async function countSharedProducts(): Promise<number> {
  try {
    const snap = await db.collection('shared_products').count().get();
    return snap.data().count as number;
  } catch (e) {
    console.warn('[Schedule] shared_products count() 실패 → 0', e);
    return 0;
  }
}

interface CycleConfig {
  totalCount: number;
  dailyCount: number;
  cyclesPerDay: number;
  sleepMs: number;
  startOffset: number;
  needsSplit: boolean;
}

async function computeCycleConfig(actualCount: number): Promise<CycleConfig> {
  let lastOffset = 0;
  try {
    const snap = await db.collection('meta').doc('stats').get();
    lastOffset = (snap.data()?.lastCheckedOffset as number | undefined) ?? 0;
  } catch (e) {
    console.warn('[Cycle] meta/stats lastCheckedOffset 읽기 실패 → 0', e);
  }

  if (actualCount <= 0) {
    return {
      totalCount: 0,
      dailyCount: 0,
      cyclesPerDay: 1,
      sleepMs: DEFAULT_SLEEP_MS,
      startOffset: 0,
      needsSplit: false,
    };
  }

  if (actualCount > DAILY_CAPACITY) {
    const startOffset = ((lastOffset % actualCount) + actualCount) % actualCount;
    return {
      totalCount: actualCount,
      dailyCount: DAILY_CAPACITY,
      cyclesPerDay: 1,
      sleepMs: DEFAULT_SLEEP_MS,
      startOffset,
      needsSplit: true,
    };
  }

  const cycleDurationMin = actualCount / 30;
  const cyclesPerDay = Math.max(
    1,
    Math.min(MAX_CYCLES, Math.floor(1230 / Math.max(cycleDurationMin, 1))),
  );
  return {
    totalCount: actualCount,
    dailyCount: actualCount,
    cyclesPerDay,
    sleepMs: DEFAULT_SLEEP_MS,
    startOffset: 0,
    needsSplit: false,
  };
}

/** 01:00 ≤ KST < 04:30 진입 시 04:30 KST까지 sleep */
async function waitIfInBlockedZone(): Promise<void> {
  const { hour, minute } = getKstHourMinute();
  const inBlocked = (hour >= 1 && hour < 4) || (hour === 4 && minute < 30);
  if (!inBlocked) return;
  const nowKst = new Date(Date.now() + KST_OFFSET);
  const targetKstMs = Date.UTC(
    nowKst.getUTCFullYear(),
    nowKst.getUTCMonth(),
    nowKst.getUTCDate(),
    4,
    30,
    0,
    0,
  );
  const waitMs = targetKstMs - nowKst.getTime();
  if (waitMs > 0) {
    console.log(
      `[BlockedZone] 01:00~04:30 KST 진입, ${(waitMs / 60000).toFixed(1)}분 대기`,
    );
    await sleep(waitMs);
  }
}

// ─── 타입 ───

interface SharedDoc {
  ref: DocumentReference;
  data: DocumentData;
}

export interface TrackerInfo {
  uid: string;
  targetPrice?: number;
}

interface LastNotifications {
  priceDrop?: Record<string, number>;
  priceUp?: Record<string, number>;
  targetReached?: Record<string, number>;
}

interface UserState {
  uid: string;
  token: string;
  app: 'jigumiya' | 'aigo';
  lastNotifications: LastNotifications;
}

export interface ProductEvent extends ProductBrief {
  dropRate: number;
  trackers: TrackerInfo[];
}

export interface RawEvents {
  drops: ProductEvent[];
  ups: ProductEvent[];
  targets: { uid: string; item: ProductBrief; targetPrice: number }[];
}

/** events.drops/ups dedup — 같은 productId 첫 항목만 보존 (방어 가드). */
function dedupByProductId<T extends { productId: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x.productId)) continue;
    seen.add(x.productId);
    out.push(x);
  }
  return out;
}

// ─── Firestore I/O ───

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

async function fetchTrackers(productId: string): Promise<TrackerInfo[]> {
  const snap = await db
    .collectionGroup('tracked')
    .where('productId', '==', productId)
    .get();
  const trackers: TrackerInfo[] = [];
  for (const docSnap of snap.docs) {
    const uid = docSnap.ref.parent.parent?.id;
    if (!uid) continue;
    const targetPrice = docSnap.data().targetPrice as number | undefined;
    trackers.push({ uid, targetPrice });
  }
  return trackers;
}

/**
 * NOTIFY_ONLY 모드 — price_drops 24h 컬렉션 조회로 events 재구성.
 * productId별 dedup (가장 최신 drop만) + 추적자 매핑 + target_reached 분류.
 */
async function loadDropsForNotifyOnly(events: RawEvents): Promise<number> {
  const since = Date.now() - ONE_DAY_MS;
  const snap = await db
    .collection('price_drops')
    .where('createdAt', '>=', since)
    .get();

  const byProductId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of snap.docs) {
    const productId = d.data().productId as string | undefined;
    if (!productId) continue;
    const createdAt = (d.data().createdAt as number | undefined) ?? 0;
    const existing = byProductId.get(productId);
    const existingCreatedAt =
      ((existing?.data().createdAt as number | undefined) ?? 0) || 0;
    if (!existing || existingCreatedAt < createdAt) {
      byProductId.set(productId, d);
    }
  }

  for (const [productId, d] of byProductId) {
    const data = d.data();
    const productName = (data.productName as string | undefined) ?? '';
    if (!productName) continue;
    const currentPrice = Number(data.currentPrice || 0);
    const previousPrice = Number(data.prevPrice || 0);
    const dropRate = Number(data.dropRate || 0);
    if (currentPrice <= 0 || previousPrice <= 0) continue;

    const trackers = await fetchTrackers(productId);
    const brief: ProductBrief = {
      productId,
      productName,
      currentPrice,
      previousPrice,
    };
    events.drops.push({ ...brief, dropRate, trackers });

    // 1.0.20: target_reached 인계 — apiPrice 단일 출처라 cron 측정값으로 직접 판정.
    for (const t of trackers) {
      const target = t.targetPrice;
      if (target && target > 0 && currentPrice <= target) {
        events.targets.push({ uid: t.uid, item: brief, targetPrice: target });
      }
    }
  }

  console.log(
    `[NotifyOnly] price_drops 24h scanned=${snap.size} dedup=${byProductId.size} drops=${events.drops.length} targets=${events.targets.length}`,
  );
  return byProductId.size;
}

function maxLastNotifTime(ln: LastNotifications): number {
  let m = 0;
  if (ln.priceDrop) {
    for (const v of Object.values(ln.priceDrop)) if (v > m) m = v;
  }
  if (ln.priceUp) {
    for (const v of Object.values(ln.priceUp)) if (v > m) m = v;
  }
  if (ln.targetReached) {
    for (const v of Object.values(ln.targetReached)) if (v > m) m = v;
  }
  return m;
}

/** 활성 사용자 (token 보유 + notificationEnabled !== false + app === 'jigumiya' strict + tracked 보유)
 *  같은 token 공유 시 winner = lastNotif desc → createdAt desc로 token당 1 uid 보장. */
async function fetchActiveUsers(
  client: Firestore,
): Promise<Map<string, UserState>> {
  const trackedSnap = await client.collectionGroup('tracked').get();
  const trackedUids = new Set<string>();
  for (const doc of trackedSnap.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid) trackedUids.add(uid);
  }

  interface Candidate {
    uid: string;
    token: string;
    lastNotif: LastNotifications;
    lastNotifTime: number;
    createdAt: number;
  }

  const snap = await client.collection('users').get();
  const candidates: Candidate[] = [];
  let skipAigo = 0;
  let skipUnknown = 0;
  let skipOther = 0;
  let skipNoTracked = 0;
  for (const u of snap.docs) {
    const d = u.data() ?? {};
    const token = d.expoPushToken as string | undefined;
    if (!token) continue;
    if (d.notificationEnabled === false) continue;
    const appField = d.app as string | undefined;
    if (appField !== 'jigumiya') {
      if (appField === 'aigo') skipAigo++;
      else if (appField == null) skipUnknown++;
      else skipOther++;
      continue;
    }
    if (!trackedUids.has(u.id)) {
      skipNoTracked++;
      continue;
    }
    const lastNotif =
      (d.lastNotifications as LastNotifications | undefined) ?? {};
    candidates.push({
      uid: u.id,
      token,
      lastNotif,
      lastNotifTime: maxLastNotifTime(lastNotif),
      createdAt: (d.createdAt as number | undefined) ?? 0,
    });
  }

  const byToken = new Map<string, Candidate[]>();
  for (const c of candidates) {
    let arr = byToken.get(c.token);
    if (!arr) {
      arr = [];
      byToken.set(c.token, arr);
    }
    arr.push(c);
  }
  const map = new Map<string, UserState>();
  let countSelected = 0;
  let sharedTokens = 0;
  let droppedShared = 0;
  for (const [token, arr] of byToken) {
    arr.sort((a, b) => {
      if (b.lastNotifTime !== a.lastNotifTime) {
        return b.lastNotifTime - a.lastNotifTime;
      }
      return b.createdAt - a.createdAt;
    });
    const winner = arr[0];
    if (arr.length > 1) {
      sharedTokens++;
      droppedShared += arr.length - 1;
      const losers = arr
        .slice(1)
        .map(
          (c) =>
            `${c.uid}(lastNotif=${c.lastNotifTime} createdAt=${c.createdAt})`,
        )
        .join(', ');
      console.log(
        `  [ActiveUsers] shared-token winner=${winner.uid} (lastNotif=${winner.lastNotifTime} createdAt=${winner.createdAt}) ` +
          `dropped=[${losers}] token=${token.slice(0, 30)}…`,
      );
    }
    map.set(winner.uid, {
      uid: winner.uid,
      token,
      app: 'jigumiya',
      lastNotifications: winner.lastNotif,
    });
    countSelected++;
  }
  console.log(
    `[ActiveUsers] jigumiya=${countSelected} (token당 lastNotif 최신 winner) ` +
      `| skip: aigo=${skipAigo} unknown=${skipUnknown} other=${skipOther} no-tracked=${skipNoTracked} ` +
      `| shared-token=${sharedTokens}개 (loser ${droppedShared}uid 제외) | trackedUids=${trackedUids.size}`,
  );
  return map;
}

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
  const notifyOnly =
    (process.env.NOTIFY_ONLY ?? 'false').toLowerCase() === 'true';
  console.log(
    '[SharedPriceChecker] 시작:',
    new Date(startedAt).toISOString(),
    'notifyOnly=' + notifyOnly,
  );

  // Block zone(01:00~04:30 KST) 가드는 가격체크 모드 전용.
  if (!notifyOnly) {
    const { hour, minute } = getKstHourMinute();
    const inBlocked =
      (hour >= 1 && hour < 4) || (hour === 4 && minute < 30);
    if (inBlocked) {
      const hh = String(hour).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');
      console.log(
        `[BlockedZone] 시작 시점이 01:00~04:30 KST 내부 (${hh}:${mm}) — 즉시 종료, 04:30 cron 대기`,
      );
      return;
    }
  }

  // §11 자동화 가드 — yml은 10분 고정 트리거, 코드가 N값 기반 간격 결정.
  if (!notifyOnly) {
    const n = await countSharedProducts();
    const { hour } = getKstHourMinute();
    const interval = computeEffectiveInterval(n, hour);
    const lastRunAt = await readLastRunAt();
    const sinceMs = startedAt - lastRunAt;
    const sinceMin = sinceMs / 60_000;
    const peak = isPeakHour(hour);
    const peakLabel = peak ? 'peak' : 'offPeak';
    const sinceLabel = lastRunAt > 0 ? `${sinceMin.toFixed(1)}min` : 'first';

    if (lastRunAt > 0 && sinceMs < interval * 60_000) {
      console.log(
        `[Schedule] N=${n} interval=${interval}min(${peakLabel}) since=${sinceLabel} — 간격 미달, 즉시 종료`,
      );
      return;
    }
    console.log(
      `[Schedule] N=${n} interval=${interval}min(${peakLabel}) since=${sinceLabel} — 실행 진행`,
    );
  }

  const events: RawEvents = {
    drops: [],
    ups: [],
    targets: [],
  };
  let scanned = 0;
  let skipZero = 0;
  let skipToday = 0;
  let cacheHits = 0;
  let apiCalls = 0;
  let priceDrops = 0;
  let rateLimited = false;
  let processedCount = 0;
  let config: CycleConfig | undefined;

  if (notifyOnly) {
    await loadDropsForNotifyOnly(events);
  } else {
    const all = await fetchAllSharedProducts();
    console.log(`[SharedPriceChecker] shared_products 풀 ${all.length}개`);

    config = await computeCycleConfig(all.length);
    const { sleepMs } = config;

    const bestCache = await loadCategoryBestCache(db);
    console.log(`[SharedPriceChecker] category_best 캐시 ${bestCache.size}개`);

    let slice: SharedDoc[];
    if (config.needsSplit && all.length > 0) {
      const start = config.startOffset % all.length;
      const end = start + config.dailyCount;
      slice =
        end <= all.length
          ? all.slice(start, end)
          : [...all.slice(start), ...all.slice(0, end - all.length)];
    } else {
      slice = all;
    }
    const sliceEndOffset = config.startOffset + slice.length;
    console.log(
      `[Cycle] N=${config.totalCount} daily=${config.dailyCount} cycles=${config.cyclesPerDay} ` +
        `sleep=${sleepMs}ms offset=${config.startOffset}~${Math.max(config.startOffset, sliceEndOffset - 1)} ` +
        `split=${config.needsSplit}`,
    );

    for (let i = 0; i < slice.length; i++) {
      await waitIfInBlockedZone();
      processedCount = i + 1;
      const item = slice[i];
      scanned++;
      const data = item.data;
      const productId = data.productId as string | undefined;
      const productName = data.productName as string | undefined;
      const vendorItemId = (data.vendorItemId as string | undefined) ?? null;
      if (!productId || !productName) continue;

      const trackerCount = Number(data.trackerCount || 0);
      if (trackerCount === 0) {
        skipZero++;
        continue;
      }

      const createdAt = data.createdAt as number | undefined;
      if (createdAt && createdAt >= cutoff) {
        skipToday++;
        console.log(`[Skip-Today] ${productId}`);
        continue;
      }

      // 1.0.20 (docs/026): apiPrice 단일 baseline. realPrice / priceStatus 가드 폐기.
      const prevApiPrice = Number(
        data.apiPrice ?? data.currentPrice ?? 0,
      );
      let newPrice = 0;
      let usedCache = false;

      // vendorItemId 추적 상품은 cache 스킵 — category_best는 productId 단위라 옵션 mismatch 가능.
      const cached = vendorItemId ? null : bestCache.get(productId);
      if (cached && isCacheStablePrice(cached.price, prevApiPrice)) {
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
          prevApiPrice,
          vendorItemId,
        );
        apiCalls++;
        if (!r.ok) {
          if (r.rateLimited) {
            console.warn('[SharedPriceChecker] rate-limited 즉시 종료');
            rateLimited = true;
            processedCount = i;
            break;
          }
          await sleep(sleepMs);
          continue;
        }
        newPrice = r.price;
        await sleep(sleepMs);
      }

      if (newPrice <= 0) continue;

      // priceHistory: 같은 날 갱신은 덮어쓰기, 새 날은 append. 최근 90일 유지.
      const today = new Date().toISOString().slice(0, 10);
      const existing: { date: string; price: number }[] =
        data.priceHistory || [];
      const history = [...existing];
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
        apiPrice: newPrice,
        priceHistory: trimmed,
        lowestPrice,
        highestPrice,
        lastCheckedAt: Date.now(),
      });

      const dropRate =
        prevApiPrice > 0 ? ((newPrice - prevApiPrice) / prevApiPrice) * 100 : 0;

      console.log(
        `  → ${prevApiPrice.toLocaleString()}→${newPrice.toLocaleString()}원${usedCache ? ' (cache)' : ''} (${dropRate.toFixed(1)}%)`,
      );

      // 변동 없음 / 비교 baseline 없음 → 알림 이벤트 없음
      if (newPrice === prevApiPrice || prevApiPrice <= 0) continue;

      // 절댓값 60% 초과는 search API 매칭 휴리스틱 오류로 간주, 알림 차단.
      if (Math.abs(dropRate) > NOTIFY_DROPRATE_GUARD_PCT) {
        console.warn(
          `[Skip-DropRateGuard] ${productId} ${productName.slice(0, 30)} dropRate=${dropRate.toFixed(1)}% — 알림 스킵`,
        );
        continue;
      }

      const brief: ProductBrief = {
        productId,
        productName,
        currentPrice: newPrice,
        previousPrice: prevApiPrice,
      };

      if (newPrice < prevApiPrice) {
        await recordPriceDrop(
          db,
          productId,
          productName,
          (data.thumbnail as string | undefined) || '',
          prevApiPrice,
          newPrice,
          trackerCount,
        );
        priceDrops++;

        const trackers = await fetchTrackers(productId);
        events.drops.push({ ...brief, dropRate, trackers });

        // 1.0.20: target_reached cron 직발사 (CF 트리거 폐기).
        for (const t of trackers) {
          const target = t.targetPrice;
          if (target && target > 0 && newPrice <= target) {
            events.targets.push({ uid: t.uid, item: brief, targetPrice: target });
          }
        }
      } else {
        // newPrice > prevApiPrice
        const trackers = await fetchTrackers(productId);
        events.ups.push({ ...brief, dropRate, trackers });
      }
    }

    if (!rateLimited) {
      const catStats = await processCategoryRoundRobin({
        db,
        sleepMs: DEFAULT_SLEEP_MS,
        batchSize: 2,
      });
      apiCalls += catStats.apiCalls;
      if (catStats.rateLimited) rateLimited = true;
    }
  }

  // ─── Flush 단계 ───
  events.drops = dedupByProductId(events.drops);
  events.ups = dedupByProductId(events.ups);

  const activeUsers = await fetchActiveUsers(db);
  const jigumiyaUsers = new Map(
    [...activeUsers].filter(([, u]) => u.app === 'jigumiya'),
  );

  const payloads: PushPayload[] = [];
  const updates = new Map<string, Record<string, number>>();
  const now = Date.now();

  function markUpdate(uid: string, path: string, value: number) {
    let u = updates.get(uid);
    if (!u) {
      u = {};
      updates.set(uid, u);
    }
    u[path] = value;
  }

  interface UserBucket {
    drops: ProductBrief[];
    ups: ProductBrief[];
    target?: { item: ProductBrief; targetPrice: number };
  }
  const userBuckets = new Map<string, UserBucket>();
  function getBucket(uid: string): UserBucket {
    let b = userBuckets.get(uid);
    if (!b) {
      b = { drops: [], ups: [] };
      userBuckets.set(uid, b);
    }
    return b;
  }

  // 1. targets — 사용자당 첫 번째 통과 상품 1건. 24h productId 가드.
  for (const ev of events.targets) {
    const user = jigumiyaUsers.get(ev.uid);
    if (!user) continue;
    const last =
      user.lastNotifications.targetReached?.[ev.item.productId] ?? 0;
    if (now - last < ONE_DAY_MS) continue;
    const b = getBucket(user.uid);
    if (!b.target) b.target = { item: ev.item, targetPrice: ev.targetPrice };
  }

  // 2. drops — target 통과 상품(같은 productId)은 자동 제외
  for (const ev of events.drops) {
    for (const t of ev.trackers) {
      const user = jigumiyaUsers.get(t.uid);
      if (!user) continue;
      const existing = userBuckets.get(user.uid);
      if (
        existing?.target &&
        existing.target.item.productId === ev.productId
      )
        continue;
      const last = user.lastNotifications.priceDrop?.[ev.productId] ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      const b = getBucket(user.uid);
      b.drops.push({
        productId: ev.productId,
        productName: ev.productName,
        currentPrice: ev.currentPrice,
        previousPrice: ev.previousPrice,
      });
    }
  }

  // 3. ups (사용자당 합산 1건)
  for (const ev of events.ups) {
    for (const t of ev.trackers) {
      const user = jigumiyaUsers.get(t.uid);
      if (!user) continue;
      const last = user.lastNotifications.priceUp?.[ev.productId] ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      const b = getBucket(user.uid);
      b.ups.push({
        productId: ev.productId,
        productName: ev.productName,
        currentPrice: ev.currentPrice,
        previousPrice: ev.previousPrice,
      });
    }
  }

  // 4. push 단계 — target 1건 + drops 상품별 각각 1건 + ups 합산 1건 (병행 발송 가능).
  for (const [uid, b] of userBuckets) {
    const user = jigumiyaUsers.get(uid);
    if (!user) continue;

    if (b.target) {
      payloads.push({
        type: 'target_reached',
        token: user.token,
        item: b.target.item,
        targetPrice: b.target.targetPrice,
      });
      markUpdate(
        uid,
        `lastNotifications.targetReached.${b.target.item.productId}`,
        now,
      );
    }

    for (const drop of b.drops) {
      payloads.push({
        type: 'price_drop_summary',
        token: user.token,
        items: [drop],
      });
      markUpdate(uid, `lastNotifications.priceDrop.${drop.productId}`, now);
    }

    if (b.ups.length > 0) {
      payloads.push({
        type: 'price_up_summary',
        token: user.token,
        items: b.ups,
      });
      for (const it of b.ups) {
        markUpdate(uid, `lastNotifications.priceUp.${it.productId}`, now);
      }
    }
  }

  console.log(`[Flush] payloads ${payloads.length}건`);
  const { successfulTokens, invalidTokens } =
    await sendSmartNotifications(payloads);

  // 발송 성공한 토큰의 uid만 lastNotifications 업데이트 — 발송 실패 시 24h 가드 박히지 않도록.
  const successfulUids = new Set<string>();
  for (const user of activeUsers.values()) {
    if (successfulTokens.has(user.token)) successfulUids.add(user.uid);
  }

  let updateCount = 0;
  let skippedNotSent = 0;
  for (const [uid, paths] of updates) {
    if (Object.keys(paths).length === 0) continue;
    if (!successfulUids.has(uid)) {
      skippedNotSent++;
      continue;
    }
    try {
      await db.collection('users').doc(uid).update(paths);
      updateCount++;
    } catch (e) {
      console.warn(`[Flush] lastNotifications 업데이트 실패 ${uid}:`, e);
    }
  }
  console.log(
    `[Flush] lastNotifications 업데이트 ${updateCount}명 (발송 성공 ${successfulUids.size}명 / 미발송 가드 스킵 ${skippedNotSent}명)`,
  );

  await cleanupInvalidTokens(invalidTokens);

  if (!notifyOnly) {
    await writeLastRunAt(startedAt);
  }

  if (config && config.needsSplit && config.totalCount > 0 && processedCount > 0) {
    const nextOffset =
      (config.startOffset + processedCount) % config.totalCount;
    try {
      await db
        .collection('meta')
        .doc('stats')
        .update({ lastCheckedOffset: nextOffset });
      console.log(
        `[Cycle] lastCheckedOffset 갱신: ${config.startOffset} → ${nextOffset} (processed=${processedCount})`,
      );
    } catch (e) {
      console.warn('[Cycle] lastCheckedOffset 갱신 실패:', e);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[SharedPriceChecker] 완료 mode=${notifyOnly ? 'notify-only' : 'price-check'} scanned=${scanned} processed=${processedCount} skipZero=${skipZero} skipToday=${skipToday} ` +
      `cacheHits=${cacheHits} apiCalls=${apiCalls} drops=${priceDrops} ups=${events.ups.length} targets=${events.targets.length} ` +
      `notif=${payloads.length} rateLimited=${rateLimited} elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error('[SharedPriceChecker] FATAL:', e);
  process.exit(1);
});
