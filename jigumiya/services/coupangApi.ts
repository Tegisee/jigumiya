import HmacSHA256 from 'crypto-js/hmac-sha256';
import Hex from 'crypto-js/enc-hex';

const BASE_URL = 'https://api-gateway.coupang.com';
const DEEPLINK_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

// API 키는 .env에서 주입 (없으면 graceful fallback)
let ACCESS_KEY = '';
let SECRET_KEY = '';

export function setCoupangApiKeys(accessKey: string, secretKey: string) {
  ACCESS_KEY = accessKey;
  SECRET_KEY = secretKey;
}

export function hasCoupangApiKeys(): boolean {
  return ACCESS_KEY.length > 0 && SECRET_KEY.length > 0;
}

function generateAuthorization(
  method: string,
  path: string,
  query: string = ''
): string {
  const now = new Date();
  const datetime = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
    .slice(2); // YYMMDDTHHmmSSZ

  const message = datetime + method + path + query;
  const signature = HmacSHA256(message, SECRET_KEY).toString(Hex);

  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

/** 쿠팡 URL → 파트너스 딥링크 변환 */
export async function generateDeepLink(
  originalUrl: string,
  subId?: string
): Promise<{ shortenUrl: string; originalUrl: string } | null> {
  if (!hasCoupangApiKeys()) return null;

  try {
    const authorization = generateAuthorization('POST', DEEPLINK_PATH);
    const body: any = { coupangUrls: [originalUrl] };
    if (subId) body.subId = subId;

    const res = await fetch(`${BASE_URL}${DEEPLINK_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    console.log('[CoupangAPI] 딥링크 응답:', json.rCode, json.data?.[0]?.shortenUrl?.slice(0, 60) || 'null');
    if (json.rCode === '0' && json.data?.[0]) {
      return {
        shortenUrl: json.data[0].shortenUrl,
        originalUrl: json.data[0].originalUrl,
      };
    }
    console.warn('[CoupangAPI] 딥링크 생성 실패:', json.rCode, json.rMessage);
    return null;
  } catch (e) {
    console.warn('[CoupangAPI] Deep link 생성 실패:', e);
    return null;
  }
}

// ─── 상품 검색 API ───

const SEARCH_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';

export interface CoupangProduct {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  isRocket: boolean;
}

/** 키워드로 상품 검색 (가격 조회용) */
export async function searchProducts(
  keyword: string,
  limit: number = 5,
): Promise<CoupangProduct[]> {
  if (!hasCoupangApiKeys()) return [];

  try {
    const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
    const authorization = generateAuthorization('GET', SEARCH_PATH, query);

    const res = await fetch(`${BASE_URL}${SEARCH_PATH}?${query}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });

    const json = await res.json();
    if (json.rCode === '0' && json.data?.productData) {
      return json.data.productData.map((p: any) => ({
        productId: p.productId,
        productName: p.productName,
        productPrice: p.productPrice,
        productImage: p.productImage,
        productUrl: p.productUrl,
        categoryName: p.categoryName || '',
        isRocket: p.isRocket || false,
      }));
    }
    return [];
  } catch (e) {
    console.warn('[CoupangAPI] 상품 검색 실패:', e);
    return [];
  }
}

// ─── 카테고리 베스트 API ───

const BEST_CATEGORIES_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories';

export interface BestCategoryProduct {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  rank: number;
  isRocket: boolean;
  isFreeShipping: boolean;
}

/** 카테고리별 베스트셀러 상품 조회 (docs/019 §3-1) */
export async function fetchBestCategories(
  categoryId: number,
  limit: number = 50,
  subId?: string,
): Promise<BestCategoryProduct[]> {
  if (!hasCoupangApiKeys()) return [];

  try {
    const path = `${BEST_CATEGORIES_PATH}/${categoryId}`;
    const params: string[] = [`limit=${limit}`];
    if (subId) params.push(`subId=${encodeURIComponent(subId)}`);
    const query = params.join('&');

    const authorization = generateAuthorization('GET', path, query);

    const res = await fetch(`${BASE_URL}${path}?${query}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });

    const json = await res.json();
    if (json.rCode === '0' && json.data) {
      const items = Array.isArray(json.data)
        ? json.data
        : json.data.productData || [];
      return items.map((p: any, idx: number) => ({
        productId: p.productId,
        productName: p.productName,
        productPrice: p.productPrice,
        productImage: p.productImage,
        productUrl: p.productUrl,
        categoryName: p.categoryName || '',
        rank: typeof p.rank === 'number' ? p.rank : idx + 1,
        isRocket: p.isRocket || false,
        isFreeShipping: p.isFreeShipping || false,
      }));
    }
    console.warn(
      '[CoupangAPI] 베스트 카테고리 조회 실패:',
      categoryId,
      json.rCode,
      json.rMessage,
    );
    return [];
  } catch (e) {
    console.warn('[CoupangAPI] 베스트 카테고리 요청 실패:', categoryId, e);
    return [];
  }
}

/**
 * URL에서 productId 추출 (다중 패턴 대응)
 *
 * 매칭 패턴:
 *   - /products/{id}            (vp/vm 정상 URL)
 *   - ?productId={id}           (쿼리)
 *   - pId%3D{id} / ?pId={id}    (단축/리다이렉트 페이지에 노출되는 변형)
 *
 * 단축 URL(`link.coupang.com/a/...`)은 본문 fetch 없이는 productId 노출 안 됨 → null.
 */
export function extractProductId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /\/products\/(\d+)/,
    /[?&]productId=(\d+)/,
    /pId%3D(\d+)/i,
    /[?&]pId=(\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** URL에서 vendorItemId 추출 (쿼리 + URL-encoded 변형) */
export function extractVendorItemId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]vendorItemId=(\d+)/,
    /vendorItemId%3D(\d+)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

