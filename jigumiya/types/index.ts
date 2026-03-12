export interface TrackedItem {
  id: string;
  url: string;
  productName: string;
  currentPrice: number;
  targetPrice: number;
  thumbnail: string;
  priceHistory: { date: string; price: number }[];
  createdAt: number;
}
