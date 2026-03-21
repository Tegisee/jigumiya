export interface ProductMeta {
  productName: string;
  thumbnail: string;
  currentPrice: number;
  productId: string | null;
}

const FALLBACK: ProductMeta = {
  productName: '',
  thumbnail: '',
  currentPrice: 0,
  productId: null,
};

// ─── 공유 텍스트 파싱 ───

/** 쿠팡 공유 텍스트에서 상품명 추출 */
function parseProductName(text: string): string {
  if (!text) return '';

  const withoutUrl = text.replace(/https?:\/\/[^\s]+/g, '').trim();
  const cleaned = withoutUrl
    .replace(/쿠팡을?\s*추천합니다!?/g, '')
    .replace(/이\s*상품\s*어때요\??/g, '')
    .replace(/쿠팡에서.*?구매할\s*수\s*있어요\.?/g, '')
    .trim();

  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^\d[\d,]*원?$/.test(line)) continue;
    if (line.length < 2) continue;
    return line.replace(/\s*\d[\d,]*원.*$/, '').trim();
  }

  return '';
}

/** 쿠팡 공유 텍스트에서 가격 추출 */
function parsePriceFromText(text: string): number {
  if (!text) return 0;
  const priceMatch = text.match(/(\d[\d,]+)\s*원/);
  if (priceMatch) {
    return parseInt(priceMatch[1].replace(/,/g, ''), 10);
  }
  return 0;
}

// ─── link.coupang.com 리다이렉트 페이지 파싱 ───

interface ShortUrlData {
  productId: string | null;
  vendorItemId: string | null;
  redirectWebUrl: string | null;
}

/** link.coupang.com 리다이렉트 페이지에서 productId, redirectWebUrl 추출 */
async function parseShortUrl(shortUrl: string): Promise<ShortUrlData> {
  const empty: ShortUrlData = {
    productId: null,
    vendorItemId: null,
    redirectWebUrl: null,
  };

  if (!shortUrl.includes('link.coupang.com')) {
    return empty;
  }

  try {
    const res = await fetch(shortUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html',
      },
    });

    if (!res.ok) return empty;
    const html = await res.text();

    // productId: pId%3D{id} 또는 products/{id}
    const pidMatch =
      html.match(/pId[=%3D]+(\d+)/) ||
      html.match(/products[/%2F]+(\d+)/);

    // vendorItemId
    const vidMatch = html.match(/vendorItemId[=%3D]+(\d+)/);

    // redirectWebUrl (JS 변수에서 추출)
    let redirectWebUrl: string | null = null;
    const urlMatch = html.match(/redirectWebUrl='([^']+)'/);
    if (urlMatch) {
      try {
        redirectWebUrl = urlMatch[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );
      } catch {
        redirectWebUrl = null;
      }
    }

    return {
      productId: pidMatch ? pidMatch[1] : null,
      vendorItemId: vidMatch ? vidMatch[1] : null,
      redirectWebUrl,
    };
  } catch (e) {
    console.warn('[parseShortUrl] 에러:', e);
    return empty;
  }
}

// ─── OG 태그 파싱 (쿠팡 상품 페이지) ───

function extractOgTag(html: string, property: string): string {
  const regex = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const match = html.match(regex);
  if (match) return match[1];

  const regex2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    'i'
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1] : '';
}

function extractPriceFromHtml(html: string): number {
  // og:price 또는 product:price:amount
  for (const prop of ['product:price:amount', 'og:price:amount']) {
    const val = extractOgTag(html, prop);
    if (val) {
      const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
      if (num > 0) return num;
    }
  }

  // JSON-LD에서 price 추출
  const jsonLdMatch = html.match(/"price"\s*:\s*"?(\d[\d,]*)"?/);
  if (jsonLdMatch) {
    const num = parseInt(jsonLdMatch[1].replace(/,/g, ''), 10);
    if (num > 0) return num;
  }

  // 쿠팡 특유의 가격 패턴: class="total-price" 안의 숫자
  const totalPriceMatch = html.match(
    /class="[^"]*total-price[^"]*"[^>]*>\s*<[^>]+>\s*([\d,]+)/
  );
  if (totalPriceMatch) {
    const num = parseInt(totalPriceMatch[1].replace(/,/g, ''), 10);
    if (num > 0) return num;
  }

  return 0;
}

/** 쿠팡 상품 페이지 fetch (앱 내에서 실행 — 디바이스 네트워크 사용) */
async function fetchCoupangPage(
  url: string
): Promise<{ price: number; thumbnail: string; title: string }> {
  const empty = { price: 0, thumbnail: '', title: '' };

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      return empty;
    }

    const html = await res.text();

    const price = extractPriceFromHtml(html);
    const thumbnail =
      extractOgTag(html, 'og:image') || extractOgTag(html, 'twitter:image');
    const title =
      extractOgTag(html, 'og:title') || extractOgTag(html, 'twitter:title');

    return {
      price,
      thumbnail,
      title: decodeHtmlEntities(title),
    };
  } catch (e) {
    console.warn('[fetchCoupangPage] fetch 에러:', e);
    return empty;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

// ─── 메인 함수 ───

/** 쿠팡 상품 메타 정보 가져오기 (3단계 fallback) */
export async function fetchProductMeta(
  rawUrl: string,
  shareText: string = ''
): Promise<ProductMeta> {
  try {
    // 1단계: 공유 텍스트에서 상품명/가격 파싱 (항상 시도)
    const nameFromText = parseProductName(shareText);
    const priceFromText = parsePriceFromText(shareText);

    // 2단계: link.coupang.com에서 productId + redirectWebUrl 추출
    const shortData = await parseShortUrl(rawUrl);
    const productId =
      shortData.productId || rawUrl.match(/\/products\/(\d+)/)?.[1] || null;

    // 3단계: 실제 쿠팡 페이지 fetch (앱 내 디바이스 네트워크)
    let pageData = { price: 0, thumbnail: '', title: '' };
    const fetchUrl = shortData.redirectWebUrl || rawUrl;
    if (fetchUrl.includes('coupang.com')) {
      pageData = await fetchCoupangPage(fetchUrl);
    }

    const result = {
      productName: pageData.title || nameFromText || '',
      thumbnail: pageData.thumbnail || '',
      currentPrice: pageData.price || priceFromText || 0,
      productId,
    };
    return result;
  } catch (e) {
    console.warn('[ProductMeta] 전체 파싱 실패:', e);
    return {
      ...FALLBACK,
      productName: parseProductName(shareText),
      currentPrice: parsePriceFromText(shareText),
    };
  }
}
