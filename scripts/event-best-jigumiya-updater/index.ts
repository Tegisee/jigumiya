/**
 * 지금이야 이벤트 베스트 업데이터 (cron, 매일 02:30 KST)
 *
 * 동작:
 *   1. 오늘 KST 기준 D-7 이내(오늘 포함 7일) 이벤트만 추림
 *   2. 해당 이벤트 없으면 graceful exit (호출 0)
 *   3. 이벤트당 keywords[] 다중 호출 → productId dedupe → 가격 내림차순 → 상위 LIMIT개
 *   4. event_best_jigumiya/{slug} 단일 문서 덮어쓰기
 *   5. 호출 사이 sleep 2초, rate-limited 감지 시 즉시 중단
 *
 * 호출량 (D-7 이내 이벤트 평균 1~2개): 키워드 4개 × 1콜 = 4~8콜/일.
 *
 * 환경변수:
 *   FIREBASE_SERVICE_ACCOUNT_KEY    Admin SDK 인증 (필수)
 *   COUPANG_ACCESS_KEY               (필수)
 *   COUPANG_SECRET_KEY               (필수)
 *   SLEEP_BETWEEN_KEYWORDS_MS        키워드 사이 sleep (기본 2000)
 *   PRODUCTS_PER_EVENT               이벤트당 최종 상품 수 (기본 50)
 *   PRODUCTS_PER_KEYWORD             키워드당 가져올 상품 수 (기본 10, search API 응답 상한)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { searchProducts, type SearchedProduct } from './coupang-api.js';
import { JIGUMIYA_EVENTS, type EventDef } from './events-jigumiya.js';

const SLEEP_MS = Number(process.env.SLEEP_BETWEEN_KEYWORDS_MS || 2_000);
const LIMIT = Number(process.env.PRODUCTS_PER_EVENT || 50);
const PER_KEYWORD = Number(process.env.PRODUCTS_PER_KEYWORD || 10);

const KST_OFFSET = 9 * 3600 * 1000;
const ONE_DAY_MS = 24 * 3600 * 1000;
const WINDOW_DAYS = 7;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** KST 'MM-DD' (오늘 + offset 일) */
function kstMonthDay(offsetDays: number): string {
  const ms = Date.now() + KST_OFFSET + offsetDays * ONE_DAY_MS;
  const d = new Date(ms);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${m}-${dd}`;
}

/** 오늘 + 0..WINDOW_DAYS-1 일의 'MM-DD' 집합 */
function buildWindowMonthDays(): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    set.add(kstMonthDay(i));
  }
  return set;
}

async function updateOne(
  db: FirebaseFirestore.Firestore,
  ev: EventDef,
): Promise<{ ok: boolean; rateLimited: boolean; count: number }> {
  console.log(
    `[EventBestJigumiya] ${ev.slug} (${ev.eventName}, ${ev.date}) keywords=[${ev.keywords.join(', ')}] perKeyword=${PER_KEYWORD} minPrice=${ev.minPrice}`,
  );

  const dedupeMap = new Map<string, SearchedProduct>();
  let rawTotal = 0;

  for (let i = 0; i < ev.keywords.length; i++) {
    const kw = ev.keywords[i]!;
    const result = await searchProducts(kw, PER_KEYWORD, ev.minPrice);

    if (result.rateLimited) {
      return { ok: false, rateLimited: true, count: 0 };
    }
    if (!result.ok) {
      console.warn(
        `[EventBestJigumiya] ${ev.slug} kw="${kw}" 응답 비정상 (rCode=${result.rCode ?? 'N/A'}) — 스킵`,
      );
    } else {
      rawTotal += result.rawCount ?? result.products.length;
      for (const p of result.products) {
        if (!dedupeMap.has(p.productId)) dedupeMap.set(p.productId, p);
      }
    }

    if (i < ev.keywords.length - 1) await sleep(SLEEP_MS);
  }

  const merged = Array.from(dedupeMap.values());
  if (merged.length === 0) {
    console.warn(
      `[EventBestJigumiya] ${ev.slug} 모든 키워드 결과 0개 — 미갱신`,
    );
    return { ok: false, rateLimited: false, count: 0 };
  }

  // 가격 내림차순 정렬 후 상위 LIMIT개 (선물 가치 우선)
  merged.sort((a, b) => b.productPrice - a.productPrice);
  // 페이로드 매핑 — search API의 productUrl이 이미 affiliate URL이므로 deepLink로 그대로 저장
  // (별도 deeplink 변환 호출 없음).
  const finalProducts = merged.slice(0, LIMIT).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    productPrice: p.productPrice,
    productImage: p.productImage,
    deepLink: p.productUrl,
    isRocket: p.isRocket,
  }));

  const docPayload = {
    slug: ev.slug,
    eventName: ev.eventName,
    date: ev.date,
    keywords: ev.keywords,
    minPrice: ev.minPrice,
    updatedAt: Date.now(),
    products: finalProducts,
  };

  await db.collection('event_best_jigumiya').doc(ev.slug).set(docPayload);

  console.log(
    `[EventBestJigumiya] ${ev.slug} 저장 완료 — ${finalProducts.length}개 (dedupe ${merged.length}/raw ${rawTotal})`,
  );
  return { ok: true, rateLimited: false, count: finalProducts.length };
}

async function main() {
  const startedAt = Date.now();
  console.log(
    `[EventBestJigumiya] 시작 ${new Date(startedAt).toISOString()} sleep=${SLEEP_MS}ms perKeyword=${PER_KEYWORD} limit=${LIMIT} window=D+0..D+${WINDOW_DAYS - 1}`,
  );

  // 1) 오늘 KST 기준 D-7 윈도우 매칭 이벤트 추출
  const windowSet = buildWindowMonthDays();
  const windowSorted = [...windowSet].sort();
  console.log(`[EventBestJigumiya] window MM-DD: ${windowSorted.join(', ')}`);

  const eligible = JIGUMIYA_EVENTS.filter((e) => windowSet.has(e.date));
  if (eligible.length === 0) {
    console.log(
      '[EventBestJigumiya] D-7 이내 이벤트 없음 — graceful exit (호출 0)',
    );
    return;
  }
  console.log(
    `[EventBestJigumiya] eligible 이벤트 ${eligible.length}개: ${eligible.map((e) => `${e.slug}(${e.date})`).join(', ')}`,
  );

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
  );
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  let success = 0;
  let failed = 0;
  let totalProducts = 0;

  for (let i = 0; i < eligible.length; i++) {
    const ev = eligible[i]!;
    const r = await updateOne(db, ev);

    if (r.rateLimited) {
      console.error(
        `[EventBestJigumiya] ⛔ rate-limited 감지 — 즉시 중단. 처리: ${i}/${eligible.length}`,
      );
      break;
    }

    if (r.ok) {
      success += 1;
      totalProducts += r.count;
    } else {
      failed += 1;
    }

    if (i < eligible.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[EventBestJigumiya] 종료 — 성공 ${success} / 실패 ${failed} / 상품 누계 ${totalProducts} elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error('[EventBestJigumiya] 치명적 오류:', e);
  process.exit(1);
});
