/**
 * 카테고리 베스트 업데이터 (docs/019 §4-1, §5-1)
 *
 * 동작:
 *   1. JIGUMIYA_CATEGORIES 순회
 *   2. 카테고리당 fetchBestCategoryProducts(id, 50) 1콜
 *   3. category_best/{categoryId} 단일 문서 덮어쓰기
 *   4. 다음 카테고리 호출 전 SLEEP_BETWEEN_CATEGORIES_MS 만큼 대기
 *   5. rate-limited 응답 감지 시 즉시 중단 (다음 cron 회차로 이월)
 *
 * 보수적 호출 정책:
 *   - 1콜이 내부적으로 100회로 카운트될 가능성 (쿠팡 답변 대기) 가정
 *   - 분당 100회 한도의 50% = 분당 50회 → 카테고리 사이 ~120초 sleep
 *   - 카테고리 20개 기준 약 40분 완료
 *
 * 환경변수:
 *   FIREBASE_SERVICE_ACCOUNT_KEY    Admin SDK 인증 (필수)
 *   COUPANG_ACCESS_KEY               쿠팡 파트너스 키 (필수)
 *   COUPANG_SECRET_KEY               쿠팡 파트너스 시크릿 (필수)
 *   SLEEP_BETWEEN_CATEGORIES_MS      카테고리 사이 sleep (기본 120000)
 *   PRODUCTS_PER_CATEGORY            카테고리당 가져올 상품 수 (기본 50)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchBestCategoryProducts } from './coupang-api.js';
import { JIGUMIYA_CATEGORIES, type CategoryDef } from './categories.js';

const SLEEP_MS = Number(process.env.SLEEP_BETWEEN_CATEGORIES_MS || 120_000);
const LIMIT = Number(process.env.PRODUCTS_PER_CATEGORY || 50);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function updateOne(
  db: FirebaseFirestore.Firestore,
  cat: CategoryDef,
): Promise<{ ok: boolean; rateLimited: boolean; count: number }> {
  console.log(
    `[Best] ${cat.categoryId} ${cat.categoryName} fetch... limit=${LIMIT}`,
  );
  const result = await fetchBestCategoryProducts(cat.categoryId, LIMIT);

  if (result.rateLimited) {
    return { ok: false, rateLimited: true, count: 0 };
  }
  if (!result.ok || result.products.length === 0) {
    console.warn(
      `[Best] ${cat.categoryId} 응답 비정상 (rCode=${result.rCode ?? 'N/A'}) — 문서 미갱신`,
    );
    return { ok: false, rateLimited: false, count: 0 };
  }

  const docPayload = {
    categoryId: cat.categoryId,
    categoryName: cat.categoryName,
    displayOrder: cat.displayOrder,
    updatedAt: Date.now(),
    products: result.products,
  };

  await db
    .collection('category_best')
    .doc(String(cat.categoryId))
    .set(docPayload);

  console.log(
    `[Best] ${cat.categoryId} ${cat.categoryName} 저장 완료 — ${result.products.length}개`,
  );
  return { ok: true, rateLimited: false, count: result.products.length };
}

async function main() {
  console.log('[CategoryBest] 시작:', new Date().toISOString());
  console.log(
    `[CategoryBest] 대상 카테고리 ${JIGUMIYA_CATEGORIES.length}개, sleep=${SLEEP_MS}ms, limit=${LIMIT}`,
  );

  if (JIGUMIYA_CATEGORIES.length === 0) {
    console.warn(
      '[CategoryBest] categories.ts 가 비어있음 — 019 §8-A 단계 ② 실측 후 채워넣을 것',
    );
    return;
  }

  // Firebase Admin 초기화
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
  );
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  let success = 0;
  let failed = 0;
  let totalProducts = 0;

  for (let i = 0; i < JIGUMIYA_CATEGORIES.length; i++) {
    const cat = JIGUMIYA_CATEGORIES[i]!;
    const r = await updateOne(db, cat);

    if (r.rateLimited) {
      console.error(
        `[CategoryBest] ⛔ rate-limited 감지 — 즉시 중단. 처리: ${i}/${JIGUMIYA_CATEGORIES.length}`,
      );
      break;
    }

    if (r.ok) {
      success += 1;
      totalProducts += r.count;
    } else {
      failed += 1;
    }

    // 마지막 카테고리 뒤에는 sleep 불필요
    if (i < JIGUMIYA_CATEGORIES.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  console.log(
    `[CategoryBest] 종료 — 성공 ${success} / 실패 ${failed} / 상품 누계 ${totalProducts}`,
  );
}

main().catch((e) => {
  console.error('[CategoryBest] 치명적 오류:', e);
  process.exit(1);
});
