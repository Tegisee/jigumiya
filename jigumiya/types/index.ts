export interface TrackedItem {
  id: string;
  url: string;
  resolvedUrl?: string; // www.coupang.com 직접 URL (redirect 없는)
  productId?: string; // 쿠팡 상품 ID (URL에서 추출)
  vendorItemId?: string; // 쿠팡 판매자 옵션 ID (URL에서 추출)
  productName: string;
  currentPrice: number;
  targetPrice: number;
  thumbnail: string;
  priceHistory: { date: string; price: number }[];
  createdAt: number;
}
