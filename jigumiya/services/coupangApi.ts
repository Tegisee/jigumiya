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

// ─── 골드박스 API ───

const GOLDBOX_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/products/goldbox';

export interface GoldboxProduct {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  isRocket: boolean;
  isFreeShipping: boolean;
}

/** 골드박스(오늘의 특가) 상품 목록 조회 */
export async function fetchGoldbox(
  subId?: string,
): Promise<GoldboxProduct[]> {
  if (!hasCoupangApiKeys()) return [];

  try {
    const query = subId ? `subId=${subId}` : '';
    const authorization = generateAuthorization('GET', GOLDBOX_PATH, query);
    const url = query
      ? `${BASE_URL}${GOLDBOX_PATH}?${query}`
      : `${BASE_URL}${GOLDBOX_PATH}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });

    const json = await res.json();
    if (json.rCode === '0' && json.data) {
      const items = Array.isArray(json.data) ? json.data : json.data.productData || [];
      return items.slice(0, 10).map((p: any) => ({
        productId: p.productId,
        productName: p.productName,
        productPrice: p.productPrice,
        productImage: p.productImage,
        productUrl: p.productUrl,
        categoryName: p.categoryName || '',
        isRocket: p.isRocket || false,
        isFreeShipping: p.isFreeShipping || false,
      }));
    }
    console.warn('[CoupangAPI] 골드박스 조회 실패:', json.rCode, json.rMessage);
    return [];
  } catch (e) {
    console.warn('[CoupangAPI] 골드박스 요청 실패:', e);
    return [];
  }
}

/** URL에서 productId 추출 */
export function extractProductId(url: string): string | null {
  const match = url.match(/\/products\/(\d+)/);
  return match ? match[1] : null;
}

