import { createHmac } from 'crypto';

const BASE_URL = 'https://api-gateway.coupang.com';
const SEARCH_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY || '';
const SECRET_KEY = process.env.COUPANG_SECRET_KEY || '';

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

/** 키워드로 상품 검색 → 가격 조회 */
export async function searchProducts(
  keyword: string,
  limit: number = 5,
): Promise<CoupangProduct[]> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error('[CoupangAPI] API 키 없음');
    return [];
  }

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
  console.log(`  [API] 응답: status=${res.status} rCode=${json.rCode} rMessage=${json.rMessage || ''} productData=${json.data?.productData?.length ?? 'null'}`);
  if (json.rCode === '0' && json.data?.productData) {
    // 디버그: 원시 응답 전체 필드 확인
    for (const p of json.data.productData) {
      console.log(`  [API] raw: productId=${p.productId} vendorItemId=${p.vendorItemId ?? 'N/A'} itemId=${p.itemId ?? 'N/A'} price=${p.productPrice} name="${(p.productName || '').slice(0, 40)}" url=${(p.productUrl || '').slice(0, 80)}`);
    }
    return json.data.productData.map((p: any) => ({
      productId: p.productId,
      productName: p.productName,
      productPrice: p.productPrice,
      productImage: p.productImage,
      productUrl: p.productUrl,
    }));
  }

  console.warn('[CoupangAPI] 검색 실패:', json.rCode, json.rMessage);
  return [];
}

/** URL에서 productId 추출 */
export function extractProductId(url: string): string | null {
  const match = url.match(/\/products\/(\d+)/);
  return match ? match[1] : null;
}

/** productId 정확 매칭으로 가격 조회 — productId 없으면 스킵 */
export async function fetchCurrentPrice(
  productName: string,
  productId: string | null,
  currentPrice: number = 0,
): Promise<{ price: number; image: string; name: string } | null> {
  if (!productName || !productId) {
    console.log(`  [API] productId 없음 → 스킵`);
    return null;
  }

  // 재시도 루프 제거 (2026-04-24): burst rate 분당 한도 초과 방지.
  // 상품당 정확히 1회 검색. 실패하면 즉시 스킵.
  const words = productName.split(/\s+/).map(w => w.replace(/[,()]/g, '')).filter(Boolean);
  const keyword = words.slice(0, 4).join(' ');
  if (keyword.length < 2) {
    console.log(`  [API] 키워드 생성 실패 → 스킵`);
    return null;
  }

  console.log(`  [API] 검색: "${keyword}" (productId=${productId})`);
  const products = await searchProducts(keyword, 5);

  if (products.length === 0) {
    console.log(`  [API] 결과 없음 → 스킵`);
    return null;
  }

  // productId 매칭 — 같은 productId가 여러 옵션(가격)으로 나올 수 있음
  const matches = products.filter((p) => String(p.productId) === productId);
  if (matches.length === 0) {
    console.log(`  [API] productId=${productId} 매칭 실패 (${products.length}개 중 일치 없음) → 스킵`);
    return null;
  }

  // 현재 가격과 가장 가까운 옵션 선택
  let best = matches[0];
  if (matches.length > 1 && currentPrice > 0) {
    best = matches.reduce((a, b) =>
      Math.abs(a.productPrice - currentPrice) <= Math.abs(b.productPrice - currentPrice) ? a : b
    );
    console.log(`  [API] productId 매칭 ${matches.length}개 → 현재가(${currentPrice})에 가장 가까운 ${best.productPrice}원 선택`);
  }

  // 가격 변동 안전장치: 30% 초과 변동 시 스킵
  if (currentPrice > 0) {
    const changeRate = Math.abs(best.productPrice - currentPrice) / currentPrice;
    if (changeRate > 0.3) {
      console.log(`  [API] productId 매칭 but 가격 변동 ${(changeRate * 100).toFixed(0)}% 초과 → 스킵 (${currentPrice}→${best.productPrice})`);
      return null;
    }
  }

  console.log(`  [API] productId 정확 매칭: "${best.productName.slice(0, 40)}" → ${best.productPrice}원`);
  return { price: best.productPrice, image: best.productImage, name: best.productName };
}
