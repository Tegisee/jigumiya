/**
 * shared-price-checker — shared_products 풀 기반 가격 체크 cron (docs/019 §5-2)
 *
 * 알림 6종 + 24h 중복 방지 + 시간대 분기 (morning/evening)
 *
 * 정책:
 *   - 실행: 매일 04:30 ~ 01:00 KST (cron schedule은 §8-D-2에서 확정)
 *   - 호출 속도: 분당 최대 40회 = sleep 1500ms (공식 한도 50회의 80% 마진)
 *   - 순서: shared_products 전체 fetch → createdAt asc 정렬
 *   - 스킵: trackerCount === 0 / 당일 추가 / category_best 캐시 hit
 *   - rate-limited 즉시 종료 (당일 재실행 없음, 019 §4-1)
 *
 * 알림 타입:
 *   1. morning_greeting     — 07:00-09:00 KST 진입 시점 / 활성 사용자 전체
 *   2. price_drop_summary   — 가격 하락 / 사용자당 1개 합산
 *   3. target_reached       — 목표가 도달 / 상품별 1개 (즉시성 우선)
 *   4. price_up_summary     — 가격 상승 / 사용자당 1개 합산
 *   5. evening_no_change    — 19:30-21:00 KST 진입 시점 / 그날 가격 알림 미수신자
 *   6. broadcast_drop10/20  — 10%/20% 이상 하락 발생 시 / 활성 사용자 전체
 *
 * 24h 중복 방지: users/{uid}.lastNotifications 단일 map
 *   - morning?: number, evening?: number
 *   - priceDrop/priceUp/targetReached?: { [productId]: number }
 *   - broadcast?: { tier10?: number, tier20?: number }
 *
 * 발송 시점: 스캔 사이클 종료 후 일괄 flush (스캔 ~1분 내라 사실상 즉시).
 * 카테고리 베스트 측 broadcast 큐는 별도 PR (category-best-updater 갱신 시 기록).
 *
 * 모드:
 *   - 기본 (가격체크 모드): 04:30 KST cron (shared-price-check.yml). 가격 스캔 + flush
 *   - NOTIFY_ONLY=true (알림 전용 모드): 07:30 / 20:00 KST cron (notify-only.yml).
 *     가격 스캔 스킵, price_drops 24h 조회로 events.drops 재구성 → flush.
 *     morning_greeting / evening_no_change / 누적 drop_summary 발송 트리거가 목적.
 *     04:30 새벽에 발송되던 drop_summary가 morning/evening 시간대로 미뤄짐 (UX 개선).
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
// F (2026-05-04): sleep 정책 단순화 — 외부 cron(*/10 * * * *)이 사이클 분산 담당.
//   이전: max(1500, BUDGET_MS / (N×cyclesPerDay))로 산출 → N=51 시 ~10초 (잔재 설계).
//   현재: DEFAULT_SLEEP_MS 단일값. 보수 권장 2000ms (응답 0.5s 포함 시 분당 24회 ≈ 한도 48%).
const DEFAULT_SLEEP_MS = 2000; // 분당 24~30회 — 검색 한도 50/분의 48~60%
const DAILY_CAPACITY = 50_000; // 하루 처리 가능 상품 수 (분할 모드 진입 임계)
const MAX_CYCLES = 144; // 일일 최대 사이클 (10분에 1회 == 24h × 6) — cyclesPerDay 산출 용도만 잔존
const BUDGET_MS = 1230 * 60 * 1000; // 가용 20.5h ms (04:30~01:00 KST)
const KST_OFFSET = 9 * 3600 * 1000;
const PRICE_HISTORY_KEEP = 90;
const ONE_DAY_MS = 24 * 3600 * 1000;
const BROADCAST_TIER10 = -10; // dropRate ≤ -10 (== 10% 이상 하락)
const BROADCAST_TIER20 = -20;

// ─── §11 자동화 설계 — N값 기반 실행 타이밍 자동 결정 ───
// docs/020 §3 매트릭스 — [최대 N, 간격 분]. 오름차순 정렬 필수 (lookupBaseInterval 선형 탐색).
// N > 13,200은 추후 검토 숙제 — 안전을 위해 가장 큰 간격(330)으로 fallback.
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

/** 07:00 ≤ now < 09:00 KST */
function isMorningTime(): boolean {
  const { hour } = getKstHourMinute();
  return hour >= 7 && hour < 9;
}

/**
 * §11 §3 매트릭스 룩업 — N값에 따른 기본 cron 간격 (분).
 * N > 13,200은 추후 검토 숙제(§3) — 가장 큰 간격(330분)으로 안전 fallback.
 */
function lookupBaseInterval(n: number): number {
  for (const [maxN, minutes] of INTERVAL_MATRIX) {
    if (n <= maxN) return minutes;
  }
  return INTERVAL_MATRIX[INTERVAL_MATRIX.length - 1][1];
}

/** 07:00 ≤ hour < 23:00 KST (피크 시간대, §5) */
function isPeakHour(hour: number): boolean {
  return hour >= PEAK_HOUR_START && hour < PEAK_HOUR_END;
}

/**
 * §11 실행 간격 — 피크는 base 그대로, 비피크는 base × 2.
 * Block zone(01:00~04:30) 진입은 별도 가드(`waitIfInBlockedZone`)에서 처리하므로
 * 본 함수는 시간 외 가드 없음 — 호출 측에서 Block zone 분기를 먼저 적용한다.
 */
function computeEffectiveInterval(n: number, hour: number): number {
  const base = lookupBaseInterval(n);
  return isPeakHour(hour) ? base : base * OFF_PEAK_MULTIPLIER;
}

/** §11 lastRunAt 읽기 — meta/stats.lastRunAt (없으면 0 = 첫 실행으로 처리) */
async function readLastRunAt(): Promise<number> {
  try {
    const snap = await db.collection('meta').doc('stats').get();
    return (snap.data()?.lastRunAt as number | undefined) ?? 0;
  } catch (e) {
    console.warn('[Schedule] meta/stats.lastRunAt 읽기 실패 → 0', e);
    return 0;
  }
}

/** §11 lastRunAt 갱신 — main 시작 시각으로 기록 (start-to-start 간격 유지) */
async function writeLastRunAt(at: number): Promise<void> {
  try {
    await db.collection('meta').doc('stats').set({ lastRunAt: at }, { merge: true });
  } catch (e) {
    console.warn('[Schedule] meta/stats.lastRunAt 갱신 실패:', e);
  }
}

/** §11 shared_products count() — 인터벌 사전판정용 (full fetch 회피) */
async function countSharedProducts(): Promise<number> {
  try {
    const snap = await db.collection('shared_products').count().get();
    return snap.data().count as number;
  } catch (e) {
    console.warn('[Schedule] shared_products count() 실패 → 0', e);
    return 0;
  }
}

/** KST 날짜 문자열 'YYYY-MM-DD' — morning/evening 24h jitter 방어용 (E) */
function formatKstDate(ms: number): string {
  const kst = new Date(ms + KST_OFFSET);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 19:30 ≤ now < 21:00 KST */
function isEveningTime(): boolean {
  const { hour, minute } = getKstHourMinute();
  if (hour === 19) return minute >= 30;
  if (hour === 20) return true;
  return false;
}

interface CycleConfig {
  totalCount: number; // shared_products 전체 수 (meta/stats 기준)
  dailyCount: number; // 오늘 처리할 상품 수 (split 모드면 50,000)
  cyclesPerDay: number; // 일일 사이클 수 (1~144)
  sleepMs: number; // 호출 간 sleep (1500ms 하한)
  startOffset: number; // 오늘 시작 offset (split 모드만 의미 있음)
  needsSplit: boolean;
}

/**
 * 사이클 설정 산출 — N은 shared_products 실제 fetch 길이를 진실 원천으로 사용.
 * meta/stats는 lastCheckedOffset(split 진행도)만 read.
 *
 *  - N=0             : dailyCount=0 (no-op)
 *  - N > 50,000      : 분할 모드 — dailyCount=50,000, cycles=1
 *  - 그 외           : cycles = max(1, min(144, ⌊49,200/N⌋)),
 *                       sleep = max(1500, ⌊BUDGET_MS / (N×cycles)⌋)
 *
 * 카운터 분리 운영(`meta/stats.sharedProductCount`)은 별도 갱신 메커니즘 필요 — 본 함수는
 * 카운터 미존재/0 케이스에서도 자가 보정되도록 actualCount를 직접 받음.
 */
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

  // F: sleepMs는 항상 DEFAULT_SLEEP_MS — BUDGET_MS/(N×cycles) 균등 분산 산식은 §11 외부 cron으로 대체됨.
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

  // cyclesPerDay는 로그/통계용으로만 산출 — 실제 사이클 분산은 yml 10분 cron + §11 lookupBaseInterval.
  const cycleDurationMin = actualCount / 30; // 분당 30회 가정 (sleep 2s 기준)
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

/** map 안 timestamp 중 since 이상이 하나라도 있으면 true */
function anyTimestampSince(
  map: Record<string, number> | undefined,
  since: number,
): boolean {
  if (!map) return false;
  for (const v of Object.values(map)) {
    if (v >= since) return true;
  }
  return false;
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
  // E (2026-05-04): morning/evening은 24h ms 가드 → KST 날짜 가드로 전환.
  morningKstDate?: string; // 'YYYY-MM-DD' (KST)
  eveningKstDate?: string;
  morning?: number; // legacy, no longer read
  evening?: number; // legacy, no longer read
  priceDrop?: Record<string, number>;
  priceUp?: Record<string, number>;
  targetReached?: Record<string, number>;
  broadcast?: { tier10?: number; tier20?: number }; // legacy, 미사용
  categoryBroadcast?: Record<string, number>; // legacy (2026-05-05 A 폐기 후 read X), Firestore 보존
}

interface UserState {
  uid: string;
  token: string;
  // G v2 (2026-05-04): 알림 발송 시 앱 식별. legacy(필드 미설정) → 'jigumiya'로 가정.
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
  broadcastTier10: ProductBrief[]; // legacy 통계
  broadcastTier20: ProductBrief[]; // legacy 통계
}

/** 2026-05-05 B: events.drops/ups dedup — 같은 productId 첫 항목만 보존 (방어 가드).
 *  shared_products 본 흐름은 slice 내 productId 유니크지만, loadDropsForNotifyOnly 등 외부 push 추가 시 안전망 역할. */
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

/** collectionGroup('tracked') — uid + targetPrice만 (token/notif는 활성 사용자 맵에서 join) */
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
 * NOTIFY_ONLY 모드 — price_drops 24h 컬렉션 조회로 events.drops 재구성.
 * productId별 dedup (가장 최신 drop만 유지) + 추적자 매핑 + tier10/20 broadcast 분류.
 * 24h 가드 + flush 단계 중복 방지가 발송 측에서 이미 적용되므로 안전하게 다시 채워도 OK.
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

    // target_reached 추출
    for (const t of trackers) {
      const target = t.targetPrice;
      if (target && target > 0 && currentPrice <= target) {
        events.targets.push({ uid: t.uid, item: brief, targetPrice: target });
      }
    }

    // 브로드캐스트 분류 (24h 가드는 flush에서 처리)
    if (dropRate <= BROADCAST_TIER20) {
      events.broadcastTier20.push(brief);
    } else if (dropRate <= BROADCAST_TIER10) {
      events.broadcastTier10.push(brief);
    }
  }

  console.log(
    `[NotifyOnly] price_drops 24h scanned=${snap.size} dedup=${byProductId.size} drops=${events.drops.length} targets=${events.targets.length} bc10=${events.broadcastTier10.length} bc20=${events.broadcastTier20.length}`,
  );
  return byProductId.size;
}

/** 활성 사용자 (token 보유 + notificationEnabled !== false + **app === 'jigumiya' strict**)
 *
 * 2026-05-05 (사고 후속): strict 모드로 변경 — `app === 'jigumiya'`인 사용자만 picking.
 *   배경:
 *     - 5/3 batch 거절 사고 = users 컬렉션에 jigumiya/aigo 사용자 혼재
 *     - 5/5 backfill (`users-app-backfill-20260505.mjs`)로 식별 가능한 48명 분류 완료
 *       (aigo 30, jigumiya 18). unknown 102명은 미분류 — 1.0.11 배포 후 자연 회복 대기
 *     - 이전 정책(`app !== 'aigo' → jigumiya 가정`)은 unknown 토큰 보유자(42명)에 잘못 발송 위험
 *   변경: `app === 'jigumiya'`만 발송. unknown/null/aigo/그 외는 모두 제외.
 *   회복: 기존 jigumiya 사용자가 1.0.11 실행 시 `savePushToken`이 자동 `app:'jigumiya'` 박음 → 자동 picking
 *
 * UserState.app 타입은 'jigumiya' | 'aigo' 그대로 유지 — broadcast 분기 호환성 유지(현재 jigumiya만 들어옴).
 */
async function fetchActiveUsers(
  client: Firestore,
): Promise<Map<string, UserState>> {
  const snap = await client.collection('users').get();
  const map = new Map<string, UserState>();
  // 동일 expoPushToken을 공유하는 uid 중복 제거 — 재설치/익명 재로그인으로 같은 device token이
  // 여러 user doc에 등록된 경우 한 사이클에 같은 token으로 N번 push 되는 사고 차단
  // (5/6 morning_greeting 4건 발송 사고 원인). 첫 등장 uid만 보존
  // (Firestore default ordering = doc id asc → 안정적). orphan uid의 trackers는
  // 동기적으로 수령 불가 (regression) — 별도 cleanup으로 정리 예정.
  const seenTokens = new Map<string, string>();
  let countJigumiya = 0;
  let dupTokens = 0;
  let skipAigo = 0;
  let skipUnknown = 0;
  let skipOther = 0;
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
    const firstUid = seenTokens.get(token);
    if (firstUid) {
      dupTokens++;
      console.log(
        `  [ActiveUsers] dup-token uid=${u.id} kept-first=${firstUid} token=${token.slice(0, 30)}…`,
      );
      continue;
    }
    seenTokens.set(token, u.id);
    countJigumiya++;
    map.set(u.id, {
      uid: u.id,
      token,
      app: 'jigumiya',
      lastNotifications:
        (d.lastNotifications as LastNotifications | undefined) ?? {},
    });
  }
  console.log(
    `[ActiveUsers] jigumiya=${countJigumiya} (발송 대상, token-dedup ${dupTokens}건 제외) | skip: aigo=${skipAigo} unknown=${skipUnknown} other=${skipOther}`,
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
  const morningMode = isMorningTime();
  const eveningMode = isEveningTime();
  const notifyOnly =
    (process.env.NOTIFY_ONLY ?? 'false').toLowerCase() === 'true';
  console.log(
    '[SharedPriceChecker] 시작:',
    new Date(startedAt).toISOString(),
    'morning=' + morningMode,
    'evening=' + eveningMode,
    'notifyOnly=' + notifyOnly,
  );

  // Block zone(01:00~04:30 KST) 가드는 가격체크 모드 전용.
  // notify-only 모드는 가격 스캔을 안 하므로 Block zone과 무관 — 가드 건너뜀.
  // sleep 대기는 빌링 낭비 — 다음 cron(04:30 정시)이 알아서 트리거.
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
  // notify-only 모드는 별도 cron schedule(07:30/20:00) → 본 가드 면제.
  // 첫 실행(lastRunAt=0)은 즉시 통과.
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
    broadcastTier10: [],
    broadcastTier20: [],
  };
  let scanned = 0;
  let skipZero = 0;
  let skipToday = 0;
  let cacheHits = 0;
  let apiCalls = 0;
  let priceDrops = 0;
  let rateLimited = false;
  let processedCount = 0; // slice 내 평가 완료 갯수 (rate-limited 시 미증가)
  let config: CycleConfig | undefined;

  if (notifyOnly) {
    // 가격 스캔 완전 스킵 — price_drops 24h 컬렉션 조회로 events 재구성.
    await loadDropsForNotifyOnly(events);
  } else {
    // shared_products 풀을 cycle config 산출 전에 fetch — 실제 size를 진실 원천으로 사용.
    // meta/stats.sharedProductCount(자동 갱신 미구현)에 종속되지 않게 자가 보정.
    const all = await fetchAllSharedProducts();
    console.log(`[SharedPriceChecker] shared_products 풀 ${all.length}개`);

    config = await computeCycleConfig(all.length);
    const { sleepMs } = config;

    const bestCache = await loadCategoryBestCache(db);
    console.log(`[SharedPriceChecker] category_best 캐시 ${bestCache.size}개`);

    // slice 산출: split 모드는 startOffset부터 dailyCount개 (래핑), 그 외는 전체
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
    processedCount = i + 1; // 낙관적 — rate-limited break 시 i로 롤백
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

    const prevPrice = Number(data.currentPrice || 0);
    let newPrice = 0;
    let usedCache = false;

    // vendorItemId 추적 상품은 cache 스킵 — category_best는 productId 단위라 옵션 mismatch 가능.
    const cached = vendorItemId ? null : bestCache.get(productId);
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
        vendorItemId,
      );
      apiCalls++;
      if (!r.ok) {
        if (r.rateLimited) {
          console.warn('[SharedPriceChecker] rate-limited 즉시 종료');
          rateLimited = true;
          processedCount = i; // 현재 item은 미평가 — 롤백
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

    // 변동 없음 / 비교 baseline 없음 → 알림 이벤트 없음
    if (newPrice === prevPrice || prevPrice <= 0) continue;

    const brief: ProductBrief = {
      productId,
      productName,
      currentPrice: newPrice,
      previousPrice: prevPrice,
    };
    const dropRate = ((newPrice - prevPrice) / prevPrice) * 100;

    // 2026-05-05 B: dropRate 절댓값 가드 — 60%를 넘는 변동은 search API 매칭 휴리스틱 오류
    // (옵션 mismatch / 다른 상품 매칭) 가능성이 매우 높아 알림 차단. 가격 갱신 자체는 위에서 이미 완료.
    if (Math.abs(dropRate) > 60) {
      console.warn(
        `[Skip-DropRateGuard] ${productId} ${productName.slice(0, 30)} dropRate=${dropRate.toFixed(1)}% — 알림 스킵`,
      );
      continue;
    }

    if (newPrice < prevPrice) {
      // price_drops 컬렉션 기록
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

      const trackers = await fetchTrackers(productId);
      events.drops.push({ ...brief, dropRate, trackers });

      // 목표가 도달 추출
      for (const t of trackers) {
        const target = t.targetPrice;
        if (target && target > 0 && newPrice <= target) {
          events.targets.push({ uid: t.uid, item: brief, targetPrice: target });
        }
      }

      // 브로드캐스트 (10%/20% 이상 하락)
      if (dropRate <= BROADCAST_TIER20) {
        events.broadcastTier20.push(brief);
      } else if (dropRate <= BROADCAST_TIER10) {
        events.broadcastTier10.push(brief);
      }
    } else {
      // newPrice > prevPrice
      const trackers = await fetchTrackers(productId);
      events.ups.push({ ...brief, dropRate, trackers });
    }
    }

    // 2026-05-05 A: 카테고리 베스트 round-robin은 fetch + (baby/event) 문서 갱신만 수행.
    // 가격 변동 감지 + 알림 발송은 shared_products 단일 출처로 일원화 — events에 push X.
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
  // 2026-05-05 B: flush 직전 dedup — events.drops/ups에 같은 productId가 들어가도 사용자당 중복 발송 방지.
  events.drops = dedupByProductId(events.drops);
  events.ups = dedupByProductId(events.ups);

  const activeUsers = await fetchActiveUsers(db);
  // jigumiya 사용자만 picking — A 정책 후속(아이고 사용자 발송 없음)
  const jigumiyaUsers = new Map(
    [...activeUsers].filter(([, u]) => u.app === 'jigumiya'),
  );

  const payloads: PushPayload[] = [];
  // E: morning/evening은 KST 날짜 문자열, 변동 알림은 ms timestamp — 두 타입 혼용.
  const updates = new Map<string, Record<string, number | string>>();
  const pricedAlertedUids = new Set<string>();
  const todayKst = todayKstMidnight();
  const now = Date.now();
  const todayKstStr = formatKstDate(now); // E: morning/evening jitter 방어용 KST 날짜

  function markUpdate(uid: string, path: string, value: number | string) {
    let u = updates.get(uid);
    if (!u) {
      u = {};
      updates.set(uid, u);
    }
    u[path] = value;
  }

  // 1. morning_greeting — 폐기 (2026-05-07): 가격 변동 알림만 유지 정책

  // 2~4. 변동 알림 — 지금이야 사용자 전용 (jigumiyaUsers).
  //  - target_reached: 사용자당 첫 번째 통과 상품 1건 (B 통합 유지)
  //  - drops: H1 (2026-05-04, v2): 사용자당 1건 통합 → 상품별 각각 1건씩 발송으로 변경
  //           예) 관심상품 3개 동시 하락 → 3건 알림 (각각 detail 라우팅 + "{name} {prev}원 → {curr}원 ↓")
  //           target 통과 상품(같은 productId)은 자동 제외 (target_reached로 이미 발송)
  //  - ups: 사용자당 1건 합산 유지 (사용자 사양 명시 X — drop만 분리 요청)
  // 24h productId 가드 유지 — 같은 상품 하루 안 여러 번 차단.
  // C: shared_products 가격 하락 → 해당 상품 관심등록자에게만 (shared 출처 broadcast는 폐기, 아래 §5).
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

  // 2-A. targets — 가드 통과 항목만 bucket.target에 등록 (사용자당 첫 번째 1건만 보존)
  for (const ev of events.targets) {
    const user = jigumiyaUsers.get(ev.uid);
    if (!user) continue;
    const last =
      user.lastNotifications.targetReached?.[ev.item.productId] ?? 0;
    if (now - last < ONE_DAY_MS) continue;
    const b = getBucket(user.uid);
    if (!b.target) b.target = { item: ev.item, targetPrice: ev.targetPrice };
  }

  // 2-B. drops — target 통과 상품(같은 productId)은 자동 제외
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

  // 2-C. ups (사용자당 합산 1건 유지)
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

  // 2-D. push 단계 — H1 변경: target 1건 + drops 상품별 각각 1건 + ups 합산 1건 (병행 발송 가능)
  for (const [uid, b] of userBuckets) {
    const user = jigumiyaUsers.get(uid);
    if (!user) continue;

    // target_reached (사용자당 1건)
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
      pricedAlertedUids.add(uid);
    }

    // H1: drops 상품별 각각 1건씩 (notifier.ts items.length===1이면 detail 라우팅 + 단일 형식)
    for (const drop of b.drops) {
      payloads.push({
        type: 'price_drop_summary',
        token: user.token,
        items: [drop],
      });
      markUpdate(uid, `lastNotifications.priceDrop.${drop.productId}`, now);
    }
    if (b.drops.length > 0) pricedAlertedUids.add(uid);

    // ups 합산 1건 (기존 유지)
    if (b.ups.length > 0) {
      payloads.push({
        type: 'price_up_summary',
        token: user.token,
        items: b.ups,
      });
      for (const it of b.ups) {
        markUpdate(uid, `lastNotifications.priceUp.${it.productId}`, now);
      }
      pricedAlertedUids.add(uid);
    }
  }

  // 2026-05-05 A: 카테고리 베스트 broadcast(`category_broadcast`) 발송 전체 제거.
  // shared_products 단일 출처 정책 — events.categoryBroadcasts 자체가 사라짐.
  if (events.broadcastTier20.length > 0 || events.broadcastTier10.length > 0) {
    console.log(
      `[Broadcast-Legacy] tier20=${events.broadcastTier20.length} tier10=${events.broadcastTier10.length} — 통계만 유지 (shared_products 출처 발송 폐기)`,
    );
  }

  // 6. evening_no_change — 폐기 (2026-05-07): 가격 변동 알림만 유지 정책

  console.log(`[Flush] payloads ${payloads.length}건`);
  const { successfulTokens, invalidTokens } =
    await sendSmartNotifications(payloads);

  // 발송 성공한 토큰의 uid만 lastNotifications 업데이트 — 발송 실패 시 24h 가드 박히지 않도록.
  // (이전: send 전에 markUpdate가 무조건 등록됨 → batch 거절(다른 projectId 혼재 등) 시 0건 발송에도
  //  Firestore 가드만 박혀 후속 cron 전부 24h 차단 → 알림 0건 사고 원인)
  const successfulUids = new Set<string>();
  for (const user of activeUsers.values()) {
    if (successfulTokens.has(user.token)) successfulUids.add(user.uid);
  }

  // lastNotifications 일괄 업데이트 (dotted-path)
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

  // §11 lastRunAt 갱신 — start-to-start 간격을 유지하기 위해 startedAt 기록.
  // notify-only는 §11 가드 면제이므로 갱신도 스킵 (price-check 전용 카운터).
  if (!notifyOnly) {
    await writeLastRunAt(startedAt);
  }

  // split 모드: 처리한 마지막 index 기준 lastCheckedOffset 갱신 (notify-only는 가격 스캔 없으므로 스킵)
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
      `cacheHits=${cacheHits} apiCalls=${apiCalls} drops=${priceDrops} ups=${events.ups.length} ` +
      `targets=${events.targets.length} bc10=${events.broadcastTier10.length} bc20=${events.broadcastTier20.length} ` +
      `notif=${payloads.length} rateLimited=${rateLimited} elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error('[SharedPriceChecker] FATAL:', e);
  process.exit(1);
});
