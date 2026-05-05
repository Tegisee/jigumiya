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
    .slice(2);

  const message = datetime + method + path + query;
  const signature = createHmac('sha256', SECRET_KEY)
    .update(message)
    .digest('hex');

  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

export interface SearchedProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  isRocket: boolean;
}

export interface FetchResult {
  ok: boolean;
  rateLimited: boolean;
  rCode?: string;
  rMessage?: string;
  /** minPrice 필터 후 결과 */
  products: SearchedProduct[];
  /** 필터 전 응답 개수 (디버깅) */
  rawCount?: number;
}

/** search API limit 상한 — 쿠팡 파트너스 API가 응답에서 잘라내는 최대값 */
const SEARCH_LIMIT_MAX = 10;

/**
 * 키워드 검색 — search API.
 * limit: 1~10 (쿠팡 응답 상한 10개). 그 이상 요청해도 10개로 잘림 → Math.min 가드.
 * minPrice 옵션: 응답 후 클라이언트 필터 (search API 자체 미지원).
 * 429 / rate-limit rMessage 감지 시 rateLimited=true 회신 → 호출 측에서 즉시 중단.
 */
export async function searchProducts(
  keyword: string,
  limit: number = SEARCH_LIMIT_MAX,
  minPrice: number = 0,
): Promise<FetchResult> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error('[CoupangAPI] API 키 없음');
    return { ok: false, rateLimited: false, products: [] };
  }

  const effectiveLimit = Math.min(Math.max(1, limit), SEARCH_LIMIT_MAX);
  const query = `keyword=${encodeURIComponent(keyword)}&limit=${effectiveLimit}`;
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
    console.warn(`[CoupangAPI] "${keyword}" 네트워크 실패:`, e);
    return { ok: false, rateLimited: false, products: [] };
  }

  if (res.status === 429) {
    console.warn(`[CoupangAPI] "${keyword}" HTTP 429 rate-limited`);
    return { ok: false, rateLimited: true, products: [] };
  }

  let json: any;
  try {
    json = await res.json();
  } catch (e) {
    console.warn(`[CoupangAPI] "${keyword}" JSON 파싱 실패:`, e);
    return { ok: false, rateLimited: false, products: [] };
  }

  const msg = String(json?.rMessage || '');
  if (
    json?.rCode !== '0' &&
    (msg.includes('사용 횟수 초과') || msg.includes('rate'))
  ) {
    console.warn(
      `[CoupangAPI] "${keyword}" rate-limited rCode=${json.rCode} rMessage="${msg}"`,
    );
    return {
      ok: false,
      rateLimited: true,
      rCode: json.rCode,
      rMessage: msg,
      products: [],
    };
  }

  if (json?.rCode === '0' && json?.data?.productData) {
    const all: SearchedProduct[] = json.data.productData.map((p: any) => ({
      productId: String(p.productId),
      productName: String(p.productName ?? ''),
      productPrice: Number(p.productPrice ?? 0),
      productImage: String(p.productImage ?? ''),
      productUrl: String(p.productUrl ?? ''),
      isRocket: !!p.isRocket,
    }));
    const filtered =
      minPrice > 0 ? all.filter((p) => p.productPrice >= minPrice) : all;
    return {
      ok: true,
      rateLimited: false,
      products: filtered,
      rawCount: all.length,
    };
  }

  console.warn(
    `[CoupangAPI] "${keyword}" 응답 비정상 rCode=${json?.rCode} rMessage="${msg}"`,
  );
  return {
    ok: false,
    rateLimited: false,
    rCode: json?.rCode,
    rMessage: msg,
    products: [],
  };
}
