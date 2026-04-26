import { createHmac } from 'crypto';

const BASE_URL = 'https://api-gateway.coupang.com';
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
    .slice(2);

  const message = datetime + method + path + query;
  const signature = createHmac('sha256', SECRET_KEY)
    .update(message)
    .digest('hex');

  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

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

export interface FetchResult {
  ok: boolean;
  rateLimited: boolean;
  rCode?: string;
  rMessage?: string;
  products: BestCategoryProduct[];
}

/**
 * 카테고리별 베스트셀러 상품 조회.
 *
 * 429 / Rate Limit rCode 감지 시 rateLimited=true 로 회신해
 * 상위에서 즉시 cron 중단 결정 가능.
 */
export async function fetchBestCategoryProducts(
  categoryId: number,
  limit: number = 50,
): Promise<FetchResult> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error('[CoupangAPI] API 키 없음');
    return { ok: false, rateLimited: false, products: [] };
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
    console.warn(`[CoupangAPI] ${categoryId} 네트워크 실패:`, e);
    return { ok: false, rateLimited: false, products: [] };
  }

  if (res.status === 429) {
    console.warn(`[CoupangAPI] ${categoryId} HTTP 429 rate-limited`);
    return { ok: false, rateLimited: true, products: [] };
  }

  let json: any;
  try {
    json = await res.json();
  } catch (e) {
    console.warn(`[CoupangAPI] ${categoryId} JSON 파싱 실패:`, e);
    return { ok: false, rateLimited: false, products: [] };
  }

  // 쿠팡 파트너스 Rate Limit 메시지 패턴 감지 (HTTP 200으로 오는 경우 대응)
  const msg = String(json?.rMessage || '');
  if (
    json?.rCode !== '0' &&
    (msg.includes('사용 횟수 초과') || msg.includes('rate'))
  ) {
    console.warn(
      `[CoupangAPI] ${categoryId} rate-limited 응답 rCode=${json.rCode} rMessage="${msg}"`,
    );
    return {
      ok: false,
      rateLimited: true,
      rCode: json.rCode,
      rMessage: msg,
      products: [],
    };
  }

  if (json?.rCode === '0' && json?.data) {
    const items = Array.isArray(json.data)
      ? json.data
      : json.data.productData || [];
    const products: BestCategoryProduct[] = items.map(
      (p: any, idx: number) => ({
        rank: typeof p.rank === 'number' ? p.rank : idx + 1,
        productId: String(p.productId),
        productName: p.productName,
        productPrice: p.productPrice,
        productImage: p.productImage,
        productUrl: p.productUrl,
        isRocket: !!p.isRocket,
        isFreeShipping: !!p.isFreeShipping,
      }),
    );
    return { ok: true, rateLimited: false, products };
  }

  console.warn(
    `[CoupangAPI] ${categoryId} 응답 비정상 rCode=${json?.rCode} rMessage="${msg}"`,
  );
  return {
    ok: false,
    rateLimited: false,
    rCode: json?.rCode,
    rMessage: msg,
    products: [],
  };
}
