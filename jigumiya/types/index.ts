/**
 * 1.0.19 가격 상태 머신 (docs/025).
 *   INIT: apiPrice만 존재 (상품 추가 직후) — 알림/그래프 X
 *   SYNCING: 첫 realPrice 수신 후 baseline 설정 — 알림 X, 그래프 1점
 *   TRACKING: 두 번째 realPrice 이후 정상 추적 — 알림 O, 그래프 누적
 */
export type PriceStatus = 'INIT' | 'SYNCING' | 'TRACKING';

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
  /**
   * 1.0.17: WebView 가격 체크를 마지막으로 시도한 시점 (성공/실패 무관).
   * 포그라운드 자동 새로고침의 TTL(기본 6h) 가드용. Akamai 차단 시 즉시 재시도 폭주 방지.
   * realPrice는 lastRealPriceUpdatedAt에서 추적되지만, 그건 "성공만 기록" → 차단 누적 회피용으로는 부적합.
   */
  lastWebViewCheckedAt?: number;
  /**
   * 1.0.19 §2 가격 상태 머신. 미설정 시 'TRACKING'으로 간주 (마이그레이션 전 기존 상품 호환).
   * 신규 상품은 'INIT'으로 시작 — apiPrice만 존재, 알림/그래프 X.
   */
  priceStatus?: PriceStatus;
  /** apiPrice — Functions가 vp HTML OG 태그에서 추출한 best-effort 가격. INIT 상태의 fallback 표시용. */
  apiPrice?: number;
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
  /**
   * @deprecated 1.0.16 RealPrice 아키텍처(docs/023) 이행 중 — 곧 apiPrice/realPrice로 대체.
   * cron이 apiPrice와 동시에 mirror, 앱은 realPrice 우선 사용 + 미존재 시 fallback.
   */
  currentPrice: number;
  /** cron(파트너스 search API) 정가. 즉시할인 미반영 → 알림/그래프 베이스 X. (docs/023) */
  apiPrice?: number;
  /** 앱 WebView가 파싱한 실제 판매가. 알림/그래프의 진실 원천. (docs/023) */
  realPrice?: number;
  /** realPrice 마지막 write 시점. cron이 본 값으로 최근 WebView 갱신 여부 판단 후 가격 skip. */
  lastRealPriceUpdatedAt?: number;
  /** cron이 apiPrice 큰 변동 감지 시 true. CF/앱이 realPrice 재확인 후 false로 클리어. */
  needsCheck?: boolean;
  lowestPrice: number;
  highestPrice: number;
  priceHistory: { date: string; price: number }[]; // 최근 90일 — 1.0.16에서 realPrice 기준으로 단계 전환 예정
  trackerCount: number; // 홈 추적 유저 수 (FieldValue.increment로 관리)
  favoriteCount: number; // 자주사는 유저 수
  lastCheckedAt: number; // ms epoch — cron의 apiPrice 마지막 갱신 시점
  lastPriceDropAt?: number;
  lastDropRate?: number; // 음수 %
  createdAt?: number; // ms epoch — 신규 생성 시 기록 (019 §5-2 당일 추가 스킵용)
  /**
   * 1.0.19 §2 가격 상태 머신. 신규 상품은 'INIT'으로 시작 → 첫 realPrice 시 SYNCING → 두 번째 realPrice 시 TRACKING.
   * 마이그레이션 전 기존 문서는 미설정(undefined) → 앱은 'TRACKING'으로 간주. (docs/025)
   */
  priceStatus?: PriceStatus;
  /** SYNCING 진입 시각 (첫 realPrice). */
  firstRealPriceAt?: number;
  /** TRACKING 진입 시각 (두 번째 realPrice). */
  trackingStartedAt?: number;
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

/** event_best_jigumiya/{slug} 의 products 배열 항목 */
export interface EventBestJigumiyaProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  /** affiliate URL (`link.coupang.com/...`) — search API의 productUrl 그대로 */
  deepLink: string;
  isRocket: boolean;
}

/** event_best_jigumiya/{slug} — 11개 기념일 D-7 윈도우 베스트 (cron 02:35 KST) */
export interface EventBestJigumiya {
  slug: string;
  eventName: string;
  date: string;          // 'MM-DD' (KST)
  keywords: string[];
  minPrice: number;
  products: EventBestJigumiyaProduct[];
  updatedAt: number;
}

/** coupang_pl/{YYYY-MM-DD KST} 의 products 배열 항목 */
export interface CoupangPLProductItem {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  deepLink: string;     // 이미 affiliate URL
  isRocket: boolean;
  isFreeShipping: boolean;
  /** 카테고리명 — 자동 탭 생성용. 응답에 없으면 미존재 가능 (UI는 '기타'로 분류) */
  categoryName?: string;
}

/** coupang_pl/{YYYY-MM-DD KST} — 일자별 PL 100개 스냅샷 */
export interface CoupangPLDoc {
  date: string;
  products: CoupangPLProductItem[];
  updatedAt: number;
}

/** goldbox/{YYYY-MM-DD KST} 의 products 배열 항목 */
export interface GoldboxProductItem {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  /** affiliate URL (이미 변환된 상태로 응답) */
  deepLink: string;
}

/** goldbox/{YYYY-MM-DD KST} — 일자별 골드박스 1콜 스냅샷 (cron 07:30 KST) */
export interface GoldboxDoc {
  date: string;
  products: GoldboxProductItem[];
  updatedAt: number;
}

/** meta/config_jigumiya — 앱 업데이트 알림 설정 (운영자 콘솔에서 갱신) */
export interface MetaConfig {
  minRequiredVersion: string;  // semver, 예: "1.0.7"
  latestVersion: string;       // 정보용, 예: "1.0.7"
  updateMessage?: string;      // 선택: 커스텀 안내문구 (없으면 기본문구)
  forceUpdate?: boolean;       // true면 "나중에" 버튼 숨김 + cancelable:false
}
