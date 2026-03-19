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
  if (json.rCode === '0' && json.data?.productData) {
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

/** productId로 검색 → 현재 가격 반환 (여러 키워드 전략) */
export async function fetchCurrentPrice(
  productName: string,
  productId: string | null,
): Promise<{ price: number; image: string } | null> {
  if (!productName) return null;

  // 검색 키워드 전략: 구체적 → 포괄적 순서로 시도
  const words = productName.split(/\s+/).filter(Boolean);
  const keywords = [
    words.slice(0, 4).join(' '),  // 1차: 처음 4단어
    words.slice(0, 2).join(' '),  // 2차: 처음 2단어
  ].filter((k) => k.length >= 2);

  for (const keyword of keywords) {
    console.log(`  [API] 검색: "${keyword}" (productId=${productId || 'none'})`);
    const products = await searchProducts(keyword, 20);

    if (products.length === 0) {
      console.log(`  [API] 결과 없음`);
      continue;
    }

    console.log(`  [API] ${products.length}개 결과`);

    // productId가 있으면 정확 매칭
    if (productId) {
      const exact = products.find((p) => String(p.productId) === productId);
      if (exact) {
        console.log(`  [API] productId 매칭 성공: ${exact.productPrice}원`);
        return { price: exact.productPrice, image: exact.productImage };
      }
    }

    // productId 매칭 실패 → 상품명 유사도로 매칭
    const nameMatch = products.find((p) =>
      p.productName.includes(words[0]) && p.productName.includes(words[1] || words[0]),
    );
    if (nameMatch) {
      console.log(`  [API] 이름 매칭: "${nameMatch.productName.slice(0, 30)}" → ${nameMatch.productPrice}원`);
      return { price: nameMatch.productPrice, image: nameMatch.productImage };
    }
  }

  console.log(`  [API] 모든 검색 전략 실패`);
  return null;
}
