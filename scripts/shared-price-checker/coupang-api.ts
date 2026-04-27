import { createHmac } from 'crypto';

const BASE_URL = 'https://api-gateway.coupang.com';
const SEARCH_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';

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
 * rate-limited 시 명시 분기 → 호출자가 즉시 break 가능.
 */
export async function fetchCurrentPrice(
  productName: string,
  productId: string | null,
  currentPrice: number = 0,
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

  console.log(`  [API] 검색: "${keyword}" (productId=${productId})`);
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
