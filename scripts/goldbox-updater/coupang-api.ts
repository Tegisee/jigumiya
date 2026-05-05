import { createHmac } from 'crypto';

const BASE_URL = 'https://api-gateway.coupang.com';
// 골드박스만 v1 prefix 없는 경로 — `/products/goldbox` (다른 엔드포인트와 다름).
const GOLDBOX_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/products/goldbox';

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

export interface GoldboxProduct {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  isRocket: boolean;
}

export interface FetchGoldboxResult {
  ok: boolean;
  rateLimited: boolean;
  rCode?: string;
  rMessage?: string;
  products: GoldboxProduct[];
}

/**
 * 골드박스(오늘의 특가) 상품 목록 — 1콜 응답 (limit 미지원, 쿠팡이 결정한 갯수 반환).
 * 429 / rate-limit rMessage 감지 시 rateLimited=true 회신 → 호출 측에서 즉시 중단 결정.
 */
export async function fetchGoldbox(): Promise<FetchGoldboxResult> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error('[CoupangAPI] API 키 없음');
    return { ok: false, rateLimited: false, products: [] };
  }

  const authorization = generateAuthorization('GET', GOLDBOX_PATH);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${GOLDBOX_PATH}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });
  } catch (e) {
    console.warn('[CoupangAPI] goldbox 네트워크 실패:', e);
    return { ok: false, rateLimited: false, products: [] };
  }

  if (res.status === 429) {
    console.warn('[CoupangAPI] goldbox HTTP 429 rate-limited');
    return { ok: false, rateLimited: true, products: [] };
  }

  let json: any;
  try {
    json = await res.json();
  } catch (e) {
    console.warn('[CoupangAPI] goldbox JSON 파싱 실패:', e);
    return { ok: false, rateLimited: false, products: [] };
  }

  const msg = String(json?.rMessage || '');
  if (
    json?.rCode !== '0' &&
    (msg.includes('사용 횟수 초과') || msg.includes('rate'))
  ) {
    console.warn(
      `[CoupangAPI] goldbox rate-limited rCode=${json.rCode} rMessage="${msg}"`,
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
    const products: GoldboxProduct[] = items.map((p: any) => ({
      productId: String(p.productId),
      productName: String(p.productName ?? ''),
      productPrice: Number(p.productPrice ?? 0),
      productImage: String(p.productImage ?? ''),
      productUrl: String(p.productUrl ?? ''),
      isRocket: !!p.isRocket,
    }));
    return { ok: true, rateLimited: false, products };
  }

  console.warn(
    `[CoupangAPI] goldbox 응답 비정상 rCode=${json?.rCode} rMessage="${msg}"`,
  );
  return {
    ok: false,
    rateLimited: false,
    rCode: json?.rCode,
    rMessage: msg,
    products: [],
  };
}
