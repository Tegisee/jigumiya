/**
 * 쿠팡 PL 업데이터 (cron, 매일 07:30 KST)
 *
 * 동작:
 *   1. /products/coupangPL 1콜 (limit 100)으로 PL 상품 목록 fetch.
 *      coupangPL API 응답의 productUrl이 이미 affiliate URL → 별도 deeplink 변환 불필요.
 *   2. Firestore coupang_pl/{YYYY-MM-DD KST} 문서에 저장.
 *      페이로드: { date, products: [{ productId, productName, productPrice, productImage,
 *                                     deepLink, isRocket, isFreeShipping }], updatedAt }
 *   3. rate-limited 감지 시 즉시 종료 (당일 재실행 없음).
 *
 * 호출량: 1콜/일.
 *
 * 환경변수:
 *   FIREBASE_SERVICE_ACCOUNT_KEY    Admin SDK 인증 (필수)
 *   COUPANG_ACCESS_KEY               쿠팡 파트너스 키 (필수)
 *   COUPANG_SECRET_KEY               쿠팡 파트너스 시크릿 (필수)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchCoupangPL } from './coupang-api.js';

const KST_OFFSET = 9 * 3600 * 1000;
const LIMIT = 100;

/** YYYY-MM-DD (KST) — Firestore 문서 ID + 페이로드 date 필드 */
function todayKstDateString(): string {
  const kst = new Date(Date.now() + KST_OFFSET);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface CoupangPLDocProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  /** affiliate URL (`link.coupang.com/a/...`) — coupangPL은 이미 affiliate URL 반환 */
  deepLink: string;
  isRocket: boolean;
  isFreeShipping: boolean;
}

async function main() {
  const startedAt = Date.now();
  const dateStr = todayKstDateString();
  console.log(
    `[CoupangPL] 시작 ${new Date(startedAt).toISOString()} date=${dateStr} limit=${LIMIT}`,
  );

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
  );
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  // 1) coupangPL fetch
  const result = await fetchCoupangPL(LIMIT);
  if (result.rateLimited) {
    console.error('[CoupangPL] ⛔ rate-limited 감지 — 즉시 종료 (당일 재실행 없음)');
    return;
  }
  if (!result.ok) {
    console.warn(
      `[CoupangPL] 응답 비정상 rCode=${result.rCode ?? 'N/A'} rMessage="${result.rMessage ?? ''}" — 문서 미갱신`,
    );
    return;
  }
  if (result.products.length === 0) {
    console.warn('[CoupangPL] 응답 0건 — 문서 미갱신');
    return;
  }
  console.log(`[CoupangPL] fetch 완료 — ${result.products.length}개`);

  // 2) 페이로드 빌드 — coupangPL API의 productUrl이 이미 affiliate URL이므로 그대로 사용
  const products: CoupangPLDocProduct[] = result.products.map((p) => ({
    productId: p.productId,
    productName: p.productName,
    productPrice: p.productPrice,
    productImage: p.productImage,
    deepLink: p.productUrl,
    isRocket: p.isRocket,
    isFreeShipping: p.isFreeShipping,
  }));

  // 3) Firestore 저장 — coupang_pl/{YYYY-MM-DD}
  await db.collection('coupang_pl').doc(dateStr).set({
    date: dateStr,
    products,
    updatedAt: Date.now(),
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[CoupangPL] 저장 완료 — coupang_pl/${dateStr} ${products.length}개 elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error('[CoupangPL] 치명적 오류:', e);
  process.exit(1);
});
