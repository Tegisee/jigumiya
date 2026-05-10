import { createHmac } from 'crypto';

const BASE_URL = 'https://api-gateway.coupang.com';
const SEARCH_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
const BEST_CATEGORIES_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories';

const ACCESS_KEY = (process.env.COUPANG_ACCESS_KEY || '').trim();
const SECRET_KEY = (process.env.COUPANG_SECRET_KEY || '').trim();

function generateAuthorization(
  method: string,
  path: string,
  query: string = '',
): string {
  const now = new Date();
  const datetime = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
    .slice(2); // YYMMDDTHHmmSSZ

  const message = datetime + method + path + query;
  const signature = createHmac('sha256', SECRET_KEY)
    .update(message)
    .digest('hex');

  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

export interface CoupangProduct {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  vendorItemId?: string; // 옵션(SKU) 고정 매칭용 — search 응답에 포함될 때만
  itemId?: string;
}

export type SearchResult =
  | { ok: true; products: CoupangProduct[] }
  | { ok: false; rateLimited: boolean; reason: string };

/** rate-limited 휴리스틱 — HTTP 429 또는 응답 본문 신호 */
function isRateLimited(status: number, rCode: any, rMessage: any): boolean {
  if (status === 429) return true;
  const code = String(rCode ?? '');
  if (code === '429') return true;
  const msg = String(rMessage ?? '').toLowerCase();
  return (
    msg.includes('rate') ||
    msg.includes('limit') ||
    msg.includes('too many') ||
    msg.includes('제한')
  );
}

/** 키워드로 상품 검색 → 가격 조회 (rate-limit 명시 분기) */
export async function searchProducts(
  keyword: string,
  limit: number = 5,
): Promise<SearchResult> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error('[CoupangAPI] API 키 없음');
    return { ok: false, rateLimited: false, reason: 'no_keys' };
  }

  const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
  const authorization = generateAuthorization('GET', SEARCH_PATH, query);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${SEARCH_PATH}?${query}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });
  } catch (e) {
    console.warn('[CoupangAPI] fetch 실패:', e);
    return { ok: false, rateLimited: false, reason: 'fetch_error' };
  }

  if (res.status === 429) {
    console.warn('[CoupangAPI] HTTP 429 — rate limited');
    return { ok: false, rateLimited: true, reason: 'http_429' };
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      rateLimited: false,
      reason: `bad_json_status_${res.status}`,
    };
  }

  console.log(
    `  [API] 응답: status=${res.status} rCode=${json.rCode} rMessage=${json.rMessage || ''} productData=${json.data?.productData?.length ?? 'null'}`,
  );

  if (isRateLimited(res.status, json.rCode, json.rMessage)) {
    console.warn('[CoupangAPI] rate-limited 응답:', json.rCode, json.rMessage);
    return { ok: false, rateLimited: true, reason: `rcode_${json.rCode}` };
  }

  if (json.rCode === '0' && json.data?.productData) {
    // 진단 (2026-05-10): 즉시할인가 미반영 의심 — 첫 상품 응답 전체 필드 dump.
    // 목적: salePrice / discountedPrice / couponPrice 등 누락 필드 발견. 원인 확정 후 제거 예정.
    if (json.data.productData.length > 0) {
      console.log(
        `  [API] raw-full[0]: ${JSON.stringify(json.data.productData[0])}`,
      );
    }
    for (const p of json.data.productData) {
      console.log(
        `  [API] raw: productId=${p.productId} vendorItemId=${p.vendorItemId ?? 'N/A'} itemId=${p.itemId ?? 'N/A'} price=${p.productPrice} name="${(p.productName || '').slice(0, 40)}"`,
      );
    }
    return {
      ok: true,
      products: json.data.productData.map((p: any) => ({
        productId: p.productId,
        productName: p.productName,
        productPrice: p.productPrice,
        productImage: p.productImage,
        productUrl: p.productUrl,
        vendorItemId: p.vendorItemId != null ? String(p.vendorItemId) : undefined,
        itemId: p.itemId != null ? String(p.itemId) : undefined,
      })),
    };
  }

  console.warn('[CoupangAPI] 검색 실패:', json.rCode, json.rMessage);
  return {
    ok: false,
    rateLimited: false,
    reason: `rcode_${json.rCode || 'unknown'}`,
  };
}

/** URL에서 productId 추출 */
export function extractProductId(url: string): string | null {
  const match = url.match(/\/products\/(\d+)/);
  return match ? match[1] : null;
}

export type FetchPriceResult =
  | { ok: true; price: number; image: string; name: string }
  | { ok: false; rateLimited: boolean };

/**
 * productId 정확 매칭으로 가격 조회 — 재시도 루프 없음 (2026-04-24 정책).
 * vendorItemId 제공 시 옵션(SKU) 고정 매칭 — 같은 productId 내 다중 옵션의 가격 mismatch 방지.
 * rate-limited 시 명시 분기 → 호출자가 즉시 break 가능.
 */
export async function fetchCurrentPrice(
  productName: string,
  productId: string | null,
  currentPrice: number = 0,
  vendorItemId: string | null = null,
): Promise<FetchPriceResult> {
  if (!productName || !productId) {
    console.log(`  [API] productId 없음 → 스킵`);
    return { ok: false, rateLimited: false };
  }

  const words = productName
    .split(/\s+/)
    .map((w) => w.replace(/[,()]/g, ''))
    .filter(Boolean);
  const keyword = words.slice(0, 4).join(' ');
  if (keyword.length < 2) {
    console.log(`  [API] 키워드 생성 실패 → 스킵`);
    return { ok: false, rateLimited: false };
  }

  console.log(
    `  [API] 검색: "${keyword}" (productId=${productId}${vendorItemId ? `, vendorItemId=${vendorItemId}` : ''})`,
  );
  const r = await searchProducts(keyword, 5);
  if (!r.ok) {
    return { ok: false, rateLimited: r.rateLimited };
  }
  const products = r.products;

  if (products.length === 0) {
    console.log(`  [API] 결과 없음 → 스킵`);
    return { ok: false, rateLimited: false };
  }

  const matches = products.filter((p) => String(p.productId) === productId);
  if (matches.length === 0) {
    console.log(
      `  [API] productId=${productId} 매칭 실패 (${products.length}개 중 일치 없음) → 스킵`,
    );
    return { ok: false, rateLimited: false };
  }

  let best = matches[0];

  // vendorItemId 고정 매칭 — 옵션 mismatch 방지. 검색 결과에 일치 옵션이 있으면 그 가격으로 고정.
  // 일치 옵션 없으면 옵션 단종/검색 미반영 가능 → productId+price 휴리스틱으로 fallback.
  if (vendorItemId) {
    const exact = matches.find((p) => p.vendorItemId === vendorItemId);
    if (exact) {
      console.log(
        `  [API] vendorItemId=${vendorItemId} 정확 매칭 → ${exact.productPrice}원 (옵션 고정)`,
      );
      return {
        ok: true,
        price: exact.productPrice,
        image: exact.productImage,
        name: exact.productName,
      };
    }
    console.log(
      `  [API] vendorItemId=${vendorItemId} 일치 옵션 없음 (matches=${matches.length}) → productId fallback`,
    );
  }

  if (matches.length > 1 && currentPrice > 0) {
    best = matches.reduce((a, b) =>
      Math.abs(a.productPrice - currentPrice) <=
      Math.abs(b.productPrice - currentPrice)
        ? a
        : b,
    );
    console.log(
      `  [API] productId 매칭 ${matches.length}개 → 현재가(${currentPrice})에 가장 가까운 ${best.productPrice}원 선택`,
    );
  }

  // 30% 초과 변동 안전장치
  if (currentPrice > 0) {
    const changeRate =
      Math.abs(best.productPrice - currentPrice) / currentPrice;
    if (changeRate > 0.3) {
      console.log(
        `  [API] productId 매칭 but 가격 변동 ${(changeRate * 100).toFixed(0)}% 초과 → 스킵 (${currentPrice}→${best.productPrice})`,
      );
      return { ok: false, rateLimited: false };
    }
  }

  console.log(
    `  [API] productId 정확 매칭: "${best.productName.slice(0, 40)}" → ${best.productPrice}원`,
  );
  return {
    ok: true,
    price: best.productPrice,
    image: best.productImage,
    name: best.productName,
  };
}

// ─── G (2026-05-04 v2): 카테고리 단위 round-robin용 fetch 함수 ───

export interface BestCategoryProduct {
  rank: number;
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  isRocket: boolean;
  isFreeShipping: boolean;
}

export type BestCategoryResult =
  | { ok: true; products: BestCategoryProduct[] }
  | { ok: false; rateLimited: boolean; reason: string };

/** category_best용 — bestcategories API (categoryId, limit=50으로 한 번에 50개 응답) */
export async function fetchBestCategoryProducts(
  categoryId: number,
  limit: number = 50,
): Promise<BestCategoryResult> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    return { ok: false, rateLimited: false, reason: 'no_keys' };
  }

  const path = `${BEST_CATEGORIES_PATH}/${categoryId}`;
  const query = `limit=${limit}`;
  const authorization = generateAuthorization('GET', path, query);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}?${query}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });
  } catch (e) {
    console.warn(`[BestCat] ${categoryId} fetch 실패:`, e);
    return { ok: false, rateLimited: false, reason: 'fetch_error' };
  }

  if (res.status === 429) {
    return { ok: false, rateLimited: true, reason: 'http_429' };
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      rateLimited: false,
      reason: `bad_json_status_${res.status}`,
    };
  }

  if (isRateLimited(res.status, json.rCode, json.rMessage)) {
    return { ok: false, rateLimited: true, reason: `rcode_${json.rCode}` };
  }

  if (json.rCode === '0' && json.data) {
    const items = Array.isArray(json.data)
      ? json.data
      : json.data.productData || [];
    const products: BestCategoryProduct[] = items.map(
      (p: any, idx: number) => ({
        rank: typeof p.rank === 'number' ? p.rank : idx + 1,
        productId: String(p.productId),
        productName: String(p.productName ?? ''),
        productPrice: Number(p.productPrice ?? 0),
        productImage: String(p.productImage ?? ''),
        productUrl: String(p.productUrl ?? ''),
        isRocket: !!p.isRocket,
        isFreeShipping: !!p.isFreeShipping,
      }),
    );
    return { ok: true, products };
  }

  return {
    ok: false,
    rateLimited: false,
    reason: `rcode_${json.rCode || 'unknown'}`,
  };
}

export interface SearchedCategoryProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  isRocket: boolean;
}

export type SearchCategoryResult =
  | { ok: true; products: SearchedCategoryProduct[]; rawCount: number }
  | { ok: false; rateLimited: boolean; reason: string };

/** category_best_baby / event_best용 — search API (keyword, limit=50, 클라이언트 minPrice 필터) */
export async function searchKeywordCategoryProducts(
  keyword: string,
  limit: number = 50,
  minPrice: number = 0,
): Promise<SearchCategoryResult> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    return { ok: false, rateLimited: false, reason: 'no_keys' };
  }

  const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
  const authorization = generateAuthorization('GET', SEARCH_PATH, query);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${SEARCH_PATH}?${query}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });
  } catch (e) {
    console.warn(`[SearchCat] "${keyword}" fetch 실패:`, e);
    return { ok: false, rateLimited: false, reason: 'fetch_error' };
  }

  if (res.status === 429) {
    return { ok: false, rateLimited: true, reason: 'http_429' };
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      rateLimited: false,
      reason: `bad_json_status_${res.status}`,
    };
  }

  if (isRateLimited(res.status, json.rCode, json.rMessage)) {
    return { ok: false, rateLimited: true, reason: `rcode_${json.rCode}` };
  }

  if (json.rCode === '0' && json.data?.productData) {
    const raw = json.data.productData as any[];
    const all: SearchedCategoryProduct[] = raw.map((p: any) => ({
      productId: String(p.productId),
      productName: String(p.productName ?? ''),
      productPrice: Number(p.productPrice ?? 0),
      productImage: String(p.productImage ?? ''),
      productUrl: String(p.productUrl ?? ''),
      isRocket: !!p.isRocket,
    }));
    const filtered =
      minPrice > 0 ? all.filter((p) => p.productPrice >= minPrice) : all;
    return { ok: true, products: filtered, rawCount: raw.length };
  }

  return {
    ok: false,
    rateLimited: false,
    reason: `rcode_${json.rCode || 'unknown'}`,
  };
}
