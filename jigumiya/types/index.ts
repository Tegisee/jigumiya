export interface TrackedItem {
  id: string;
  url: string;
  resolvedUrl?: string; // www.coupang.com 직접 URL (redirect 없는)
  productId?: string; // 쿠팡 상품 ID (URL에서 추출)
  vendorItemId?: string; // 쿠팡 판매자 옵션 ID (URL에서 추출)
  productName: string;
  currentPrice: number;
  targetPrice?: number;
  thumbnail: string;
  priceHistory: { date: string; price: number }[];
  createdAt: number;
}

// ──────────────────────────────────────────────────────────
// Phase 3-A: shared_products 구조 (docs/017_앱구조개편_Phase3.md §2)
// 신규 경로 — 기존 users/{uid}/items 는 하위 호환 위해 유지
// ──────────────────────────────────────────────────────────

/** shared_products/{productId} — 전역 상품 단일 문서 (구독자 공유) */
export interface SharedProduct {
  productId: string; // 문서 ID와 동일
  url: string;
  resolvedUrl: string;
  vendorItemId?: string;
  productName: string;
  thumbnail: string;
  currentPrice: number;
  lowestPrice: number;
  highestPrice: number;
  priceHistory: { date: string; price: number }[]; // 최근 90일
  trackerCount: number; // 홈 추적 유저 수 (FieldValue.increment로 관리)
  favoriteCount: number; // 자주사는 유저 수
  lastCheckedAt: number; // ms epoch
  lastPriceDropAt?: number;
  lastDropRate?: number; // 음수 %
}

/** users/{uid}/tracked/{productId} — 홈 추적 참조 (10개 제한) */
export interface TrackedRef {
  productId: string;
  targetPrice?: number;
  addedAt: number;
}

/** users/{uid}/favorites/{productId} — 자주사는상품 참조 (무제한) */
export interface FavoriteRef {
  productId: string;
  addedAt: number;
}

/** price_drops/{autoId} — 가격 하락 피드 이벤트 (무제한 보관) */
export interface PriceDrop {
  productId: string;
  productName: string;
  thumbnail: string;
  prevPrice: number;
  currentPrice: number;
  dropRate: number; // 음수 %
  trackerCount: number;
  deepLink: string; // 제휴 딥링크 (바로구매용)
  createdAt: number;
}
