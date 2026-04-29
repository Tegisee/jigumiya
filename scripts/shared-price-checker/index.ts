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

// ─── 설정 ───
const SLEEP_MS = 1500;
const KST_OFFSET = 9 * 3600 * 1000;
const PRICE_HISTORY_KEEP = 90;
const ONE_DAY_MS = 24 * 3600 * 1000;
const BROADCAST_TIER10 = -10; // dropRate ≤ -10 (== 10% 이상 하락)
const BROADCAST_TIER20 = -20;

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

/** 19:30 ≤ now < 21:00 KST */
function isEveningTime(): boolean {
  const { hour, minute } = getKstHourMinute();
  if (hour === 19) return minute >= 30;
  if (hour === 20) return true;
  return false;
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

interface TrackerInfo {
  uid: string;
  targetPrice?: number;
}

interface LastNotifications {
  morning?: number;
  evening?: number;
  priceDrop?: Record<string, number>;
  priceUp?: Record<string, number>;
  targetReached?: Record<string, number>;
  broadcast?: { tier10?: number; tier20?: number };
}

interface UserState {
  uid: string;
  token: string;
  lastNotifications: LastNotifications;
}

interface ProductEvent extends ProductBrief {
  dropRate: number;
  trackers: TrackerInfo[];
}

interface RawEvents {
  drops: ProductEvent[];
  ups: ProductEvent[];
  targets: { uid: string; item: ProductBrief; targetPrice: number }[];
  broadcastTier10: ProductBrief[];
  broadcastTier20: ProductBrief[];
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

/** 활성 사용자 (token 보유 + notificationEnabled !== false) */
async function fetchActiveUsers(
  client: Firestore,
): Promise<Map<string, UserState>> {
  const snap = await client.collection('users').get();
  const map = new Map<string, UserState>();
  for (const u of snap.docs) {
    const d = u.data() ?? {};
    const token = d.expoPushToken as string | undefined;
    if (!token) continue;
    if (d.notificationEnabled === false) continue;
    map.set(u.id, {
      uid: u.id,
      token,
      lastNotifications:
        (d.lastNotifications as LastNotifications | undefined) ?? {},
    });
  }
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
  console.log(
    '[SharedPriceChecker] 시작:',
    new Date(startedAt).toISOString(),
    'morning=' + morningMode,
    'evening=' + eveningMode,
  );

  const bestCache = await loadCategoryBestCache(db);
  console.log(`[SharedPriceChecker] category_best 캐시 ${bestCache.size}개`);

  const all = await fetchAllSharedProducts();
  console.log(`[SharedPriceChecker] shared_products 풀 ${all.length}개`);

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
      console.log(`[Skip-Today] ${productId}`);
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
          console.warn('[SharedPriceChecker] rate-limited 즉시 종료');
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

  // ─── Flush 단계 ───
  const activeUsers = await fetchActiveUsers(db);
  console.log(`[Flush] 활성 사용자 ${activeUsers.size}명`);

  const payloads: PushPayload[] = [];
  const updates = new Map<string, Record<string, number>>();
  const pricedAlertedUids = new Set<string>();
  const targetedSet = new Set<string>(); // 'uid:productId' — drop_summary 중복 제외용
  const todayKst = todayKstMidnight();
  const now = Date.now();

  function markUpdate(uid: string, path: string, value: number) {
    let u = updates.get(uid);
    if (!u) {
      u = {};
      updates.set(uid, u);
    }
    u[path] = value;
  }

  // 1. morning_greeting
  if (morningMode) {
    for (const user of activeUsers.values()) {
      const last = user.lastNotifications.morning ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      payloads.push({ type: 'morning_greeting', token: user.token });
      markUpdate(user.uid, 'lastNotifications.morning', now);
    }
  }

  // 2. target_reached (상품별 1개 — 가드 통과 시 drop_summary에서 제외)
  for (const ev of events.targets) {
    const user = activeUsers.get(ev.uid);
    if (!user) continue;
    const last =
      user.lastNotifications.targetReached?.[ev.item.productId] ?? 0;
    if (now - last < ONE_DAY_MS) continue;
    payloads.push({
      type: 'target_reached',
      token: user.token,
      item: ev.item,
      targetPrice: ev.targetPrice,
    });
    markUpdate(
      user.uid,
      `lastNotifications.targetReached.${ev.item.productId}`,
      now,
    );
    pricedAlertedUids.add(user.uid);
    targetedSet.add(`${user.uid}:${ev.item.productId}`);
  }

  // 3. price_drop_summary (사용자당 1개, target 통과 상품 제외)
  const perUserDrops = new Map<string, ProductBrief[]>();
  for (const ev of events.drops) {
    for (const t of ev.trackers) {
      const user = activeUsers.get(t.uid);
      if (!user) continue;
      if (targetedSet.has(`${user.uid}:${ev.productId}`)) continue;
      const last = user.lastNotifications.priceDrop?.[ev.productId] ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      let arr = perUserDrops.get(user.uid);
      if (!arr) {
        arr = [];
        perUserDrops.set(user.uid, arr);
      }
      arr.push({
        productId: ev.productId,
        productName: ev.productName,
        currentPrice: ev.currentPrice,
        previousPrice: ev.previousPrice,
      });
      markUpdate(
        user.uid,
        `lastNotifications.priceDrop.${ev.productId}`,
        now,
      );
    }
  }
  for (const [uid, items] of perUserDrops) {
    if (items.length === 0) continue;
    const user = activeUsers.get(uid);
    if (!user) continue;
    payloads.push({
      type: 'price_drop_summary',
      token: user.token,
      items,
    });
    pricedAlertedUids.add(uid);
  }

  // 4. price_up_summary (사용자당 1개)
  const perUserUps = new Map<string, ProductBrief[]>();
  for (const ev of events.ups) {
    for (const t of ev.trackers) {
      const user = activeUsers.get(t.uid);
      if (!user) continue;
      const last = user.lastNotifications.priceUp?.[ev.productId] ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      let arr = perUserUps.get(user.uid);
      if (!arr) {
        arr = [];
        perUserUps.set(user.uid, arr);
      }
      arr.push({
        productId: ev.productId,
        productName: ev.productName,
        currentPrice: ev.currentPrice,
        previousPrice: ev.previousPrice,
      });
      markUpdate(user.uid, `lastNotifications.priceUp.${ev.productId}`, now);
    }
  }
  for (const [uid, items] of perUserUps) {
    if (items.length === 0) continue;
    const user = activeUsers.get(uid);
    if (!user) continue;
    payloads.push({
      type: 'price_up_summary',
      token: user.token,
      items,
    });
    pricedAlertedUids.add(uid);
  }

  // 5. broadcast_drop20 → broadcast_drop10 (전체 활성 사용자, 24h tier별 가드)
  if (events.broadcastTier20.length > 0) {
    for (const user of activeUsers.values()) {
      const last = user.lastNotifications.broadcast?.tier20 ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      payloads.push({
        type: 'broadcast_drop20',
        token: user.token,
        items: events.broadcastTier20,
      });
      markUpdate(user.uid, 'lastNotifications.broadcast.tier20', now);
    }
  }
  if (events.broadcastTier10.length > 0) {
    for (const user of activeUsers.values()) {
      const last = user.lastNotifications.broadcast?.tier10 ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      payloads.push({
        type: 'broadcast_drop10',
        token: user.token,
        items: events.broadcastTier10,
      });
      markUpdate(user.uid, 'lastNotifications.broadcast.tier10', now);
    }
  }

  // 6. evening_no_change (그날 가격 알림 미수신자만)
  if (eveningMode) {
    for (const user of activeUsers.values()) {
      const last = user.lastNotifications.evening ?? 0;
      if (now - last < ONE_DAY_MS) continue;
      if (pricedAlertedUids.has(user.uid)) continue;
      const ln = user.lastNotifications;
      const hadAlertToday =
        anyTimestampSince(ln.priceDrop, todayKst) ||
        anyTimestampSince(ln.priceUp, todayKst) ||
        anyTimestampSince(ln.targetReached, todayKst);
      if (hadAlertToday) continue;
      payloads.push({ type: 'evening_no_change', token: user.token });
      markUpdate(user.uid, 'lastNotifications.evening', now);
    }
  }

  console.log(`[Flush] payloads ${payloads.length}건`);
  const invalidTokens = await sendSmartNotifications(payloads);

  // lastNotifications 일괄 업데이트 (dotted-path)
  let updateCount = 0;
  for (const [uid, paths] of updates) {
    if (Object.keys(paths).length === 0) continue;
    try {
      await db.collection('users').doc(uid).update(paths);
      updateCount++;
    } catch (e) {
      console.warn(`[Flush] lastNotifications 업데이트 실패 ${uid}:`, e);
    }
  }
  console.log(`[Flush] lastNotifications 업데이트 ${updateCount}명`);

  await cleanupInvalidTokens(invalidTokens);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[SharedPriceChecker] 완료 scanned=${scanned} skipZero=${skipZero} skipToday=${skipToday} ` +
      `cacheHits=${cacheHits} apiCalls=${apiCalls} drops=${priceDrops} ups=${events.ups.length} ` +
      `targets=${events.targets.length} bc10=${events.broadcastTier10.length} bc20=${events.broadcastTier20.length} ` +
      `notif=${payloads.length} rateLimited=${rateLimited} elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error('[SharedPriceChecker] FATAL:', e);
  process.exit(1);
});
