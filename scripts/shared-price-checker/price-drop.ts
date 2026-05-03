import type { Firestore } from 'firebase-admin/firestore';

/**
 * price_drops/{productId} 멱등 upsert (docs/019 §3 / §8-A-bis)
 *
 * 호출 정책:
 *   - 가격 하락 발생 시(newPrice < prevPrice) + productId 있을 때만
 *   - 노이즈 컷은 클라이언트 필터(전체/-10%/-20% 칩)에 위임
 *   - deepLink: 쿠팡 vp URL 저장. 클라이언트가 generateDeepLink로 affiliate 변환.
 *
 * 문서 ID 규약:
 *   문서 ID = productId. 같은 상품 24h 내 여러 번 하락 시 동일 문서를 덮어쓴다 (마지막 변동만 보존).
 *   이전: collection.add() autoId → 매 cron마다 같은 productId가 별도 문서로 누적되어
 *   홈 "오늘의 특가" / 가격변동 탭에 동일 상품이 N번 표시되는 UI 중복 버그가 있었음.
 *   누적 변동 폭이 필요해지면 별도 priceHistory 컬렉션으로 분리.
 */
export async function recordPriceDrop(
  db: Firestore,
  productId: string,
  productName: string,
  thumbnail: string,
  prevPrice: number,
  newPrice: number,
  trackerCount: number,
): Promise<void> {
  if (prevPrice <= 0) return;
  const dropRate = ((newPrice - prevPrice) / prevPrice) * 100;
  try {
    await db.collection('price_drops').doc(productId).set({
      productId,
      productName,
      thumbnail,
      prevPrice,
      currentPrice: newPrice,
      dropRate: Number(dropRate.toFixed(2)),
      trackerCount,
      deepLink: `https://www.coupang.com/vp/products/${productId}`,
      createdAt: Date.now(),
    });
    console.log(
      `  [PriceDrop] 기록: ${productId} ${prevPrice}→${newPrice} (${dropRate.toFixed(1)}%) trackers=${trackerCount}`,
    );
  } catch (e) {
    console.warn('  [PriceDrop] 기록 실패:', productId, e);
  }
}
