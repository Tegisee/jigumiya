import type { Firestore } from 'firebase-admin/firestore';

/**
 * price_drops/{autoId} 기록 (docs/019 §3 / §8-A-bis)
 *
 * 호출 정책:
 *   - 가격 하락 발생 시(newPrice < prevPrice) + productId 있을 때만
 *   - 노이즈 컷은 클라이언트 필터(전체/-10%/-20% 칩)에 위임
 *   - deepLink: 쿠팡 vp URL 저장. 클라이언트가 generateDeepLink로 affiliate 변환.
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
    await db.collection('price_drops').add({
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
