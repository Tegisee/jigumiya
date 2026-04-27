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
  createdAt?: number; // ms epoch — 신규 생성 시 기록 (019 §5-2 당일 추가 스킵용)
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

// ──────────────────────────────────────────────────────────
// docs/019_Phase3_SharedProducts.md §3-1 — 카테고리 베스트
// ──────────────────────────────────────────────────────────

/** category_best 문서의 products 배열 항목 */
export interface BestProductItem {
  rank: number;
  productId: string;        // shared_products 키와 일관되게 string
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  isRocket: boolean;
  isFreeShipping: boolean;
}

/** category_best/{categoryId} — 카테고리별 베스트셀러 스냅샷 */
export interface CategoryBest {
  categoryId: number;       // 쿠팡 공식 카테고리 ID (문서 ID = String(categoryId))
  categoryName: string;
  displayOrder: number;
  updatedAt: number;        // ms epoch (017 §8-1 컨벤션 준수)
  products: BestProductItem[];
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

/** meta/config_jigumiya — 앱 업데이트 알림 설정 (운영자 콘솔에서 갱신) */
export interface MetaConfig {
  minRequiredVersion: string;  // semver, 예: "1.0.7"
  latestVersion: string;       // 정보용, 예: "1.0.7"
  updateMessage?: string;      // 선택: 커스텀 안내문구 (없으면 기본문구)
  forceUpdate?: boolean;       // true면 "나중에" 버튼 숨김 + cancelable:false
}
