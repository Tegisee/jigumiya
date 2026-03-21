export interface TrackedItem {
  id: string;
  url: string;
  resolvedUrl?: string; // www.coupang.com 직접 URL (redirect 없는)
  productName: string;
  currentPrice: number;
  targetPrice: number;
  thumbnail: string;
  priceHistory: { date: string; price: number }[];
  createdAt: number;
}
