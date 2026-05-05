/**
 * 골드박스 업데이터 (cron, 매일 07:30 KST)
 *
 * 동작:
 *   1. /products/goldbox 1콜로 오늘의 특가 목록 fetch
 *      goldbox API 응답의 productUrl이 이미 affiliate URL → 별도 deeplink 변환 불필요.
 *   2. Firestore goldbox/{YYYY-MM-DD KST} 문서에 저장
 *      페이로드: { date, products: [{ productId, productName, productPrice, productImage, deepLink }], updatedAt }
 *   3. rate-limited 감지 시 즉시 종료 (당일 재실행 없음)
 *
 * 호출량: 골드박스 1콜/일.
 *
 * 환경변수:
 *   FIREBASE_SERVICE_ACCOUNT_KEY    Admin SDK 인증 (필수)
 *   COUPANG_ACCESS_KEY               쿠팡 파트너스 키 (필수)
 *   COUPANG_SECRET_KEY               쿠팡 파트너스 시크릿 (필수)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchGoldbox } from './coupang-api.js';

const KST_OFFSET = 9 * 3600 * 1000;

/** YYYY-MM-DD (KST) — Firestore 문서 ID + 페이로드 date 필드 */
function todayKstDateString(): string {
  const kst = new Date(Date.now() + KST_OFFSET);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface GoldboxDocProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  /** affiliate URL (`link.coupang.com/a/...`) — 변환 실패 시 raw productUrl fallback */
  deepLink: string;
}

async function main() {
  const startedAt = Date.now();
  const dateStr = todayKstDateString();
  console.log(
    `[Goldbox] 시작 ${new Date(startedAt).toISOString()} date=${dateStr}`,
  );

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
  );
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  // 1) goldbox fetch
  const goldbox = await fetchGoldbox();
  if (goldbox.rateLimited) {
    console.error('[Goldbox] ⛔ rate-limited 감지 — 즉시 종료 (당일 재실행 없음)');
    return;
  }
  if (!goldbox.ok) {
    console.warn(
      `[Goldbox] 응답 비정상 rCode=${goldbox.rCode ?? 'N/A'} rMessage="${goldbox.rMessage ?? ''}" — 문서 미갱신`,
    );
    return;
  }
  if (goldbox.products.length === 0) {
    console.warn('[Goldbox] 응답 0건 — 문서 미갱신');
    return;
  }
  console.log(`[Goldbox] fetch 완료 — ${goldbox.products.length}개`);

  // 2) 페이로드 빌드 — goldbox API의 productUrl이 이미 affiliate URL이므로 별도 변환 없이 그대로 사용
  const products: GoldboxDocProduct[] = goldbox.products.map((p) => ({
    productId: p.productId,
    productName: p.productName,
    productPrice: p.productPrice,
    productImage: p.productImage,
    deepLink: p.productUrl,
  }));

  // 3) Firestore 저장 — goldbox/{YYYY-MM-DD}
  await db.collection('goldbox').doc(dateStr).set({
    date: dateStr,
    products,
    updatedAt: Date.now(),
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[Goldbox] 저장 완료 — goldbox/${dateStr} ${products.length}개 elapsed=${elapsed}s`,
  );
}

main().catch((e) => {
  console.error('[Goldbox] 치명적 오류:', e);
  process.exit(1);
});
