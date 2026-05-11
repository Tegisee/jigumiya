/**
 * 쿠팡 페이지 HTML 진단 — SCRAPE_JS 셀렉터 매칭 여부 확인 (2026-05-12).
 *
 * 목적: 1.0.16에서 보고된 CoupangScraper 파싱 실패 원인 식별.
 *   - 모바일 UA로 www.coupang.com/vp/products/...를 fetch했을 때
 *     실제로 어떤 HTML이 오는지, 현재 SCRAPE_JS 셀렉터들이 매칭되는지 검증.
 *   - 데스크톱 UA와 비교해서 페이지 분기 동작도 확인.
 *
 * 실행:
 *   node scripts/cleanup/inspect-coupang-html-20260512.mjs
 */

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 검증 대상 productId — 어제 본 사용자 본인 tracked 10개 중 일반적 상품 위주.
// 9309948201: 갤럭시 S26 (real=1009000)
// 7250917955: 하남쭈꾸미 (createdAt 보유 안정 doc)
// 175610420:  일동 파워젤
const PRODUCT_IDS = ['9309948201', '7250917955', '175610420'];

const BASE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://www.coupang.com',
};

async function fetchOnce(url, ua) {
  try {
    const start = Date.now();
    const res = await fetch(url, {
      headers: { ...BASE_HEADERS, 'User-Agent': ua },
      redirect: 'follow',
    });
    const html = await res.text();
    const elapsed = Date.now() - start;
    return {
      ok: true,
      status: res.status,
      finalUrl: res.url,
      html,
      length: html.length,
      elapsed,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function countMatches(html, pattern) {
  const re = new RegExp(pattern, 'g');
  return (html.match(re) || []).length;
}

function firstMatch(html, pattern) {
  const re = new RegExp(pattern);
  const m = html.match(re);
  return m ? m[1] : null;
}

// 현재 SCRAPE_JS의 셀렉터들이 HTML 안에 존재하는지 검증.
function inspectHtml(html) {
  const report = {};

  // ─── 제목 셀렉터 ───
  report.title = {
    'og:title': firstMatch(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i),
    'prod-buy-header__title': html.includes('prod-buy-header__title'),
    'title-tag': firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i),
  };

  // ─── 가격 셀렉터 ───
  report.price = {
    '.total-price (string)': html.includes('total-price'),
    '.total-price strong': html.includes('total-price') && /total-price[^"]*">.*?<strong/.test(html),
    '.prod-sale-price': html.includes('prod-sale-price'),
    'meta product:price:amount': firstMatch(html, /<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i),
    'meta og:price:amount': firstMatch(html, /<meta\s+property=["']og:price:amount["']\s+content=["']([^"']+)["']/i),
    'ld+json offers.price': firstMatch(html, /"offers"\s*:\s*\{[^}]*?"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/),
  };

  // ─── 이미지 셀렉터 ───
  report.image = {
    'og:image': firstMatch(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i),
    '.prod-image__detail img': html.includes('prod-image__detail'),
    '.prod-image img': html.includes('prod-image'),
  };

  // ─── Next.js / SPA state (셀렉터 면역 데이터 출처) ───
  report.spaState = {
    '__NEXT_DATA__': html.includes('__NEXT_DATA__'),
    '__INITIAL_STATE__': html.includes('__INITIAL_STATE__'),
    '__APP_STATE__': html.includes('__APP_STATE__'),
    'window.coupangApp': html.includes('window.coupangApp'),
    'dataLayer': html.includes('dataLayer'),
  };

  // ─── 차단/봇 페이지 신호 ───
  report.blockSignals = {
    body_short: html.length < 5000,
    'captcha': /captcha|robot|forbidden|access\s+denied/i.test(html),
    '503': html.includes('503'),
    'meta_count': countMatches(html, /<meta\s/),
    'script_count': countMatches(html, /<script[^>]*>/),
  };

  // ─── 가격 후보 (class*=price 패턴 + "N,NNN원" 정규식) ───
  const priceClassPattern = countMatches(html, /class=["'][^"']*price[^"']*["']/i);
  const priceRegex = html.match(/(\d{1,3}(?:,\d{3}){1,3})\s*원/g);
  const priceCandidates = priceRegex ? [...new Set(priceRegex)].slice(0, 15) : [];
  report.priceCandidates = {
    'class*="price" 노드 수': priceClassPattern,
    '"N,NNN원" 매칭': priceRegex?.length ?? 0,
    'unique 상위 15': priceCandidates,
  };

  // ─── 모바일 페이지 추정 클래스 후보 (현재 셀렉터에 없는) ───
  report.mobileCandidates = {
    'prod-price-amount': html.includes('prod-price-amount'),
    'prod-coupon-price': html.includes('prod-coupon-price'),
    'final-price': html.includes('final-price'),
    'sale-price': html.includes('sale-price') && !html.includes('prod-sale-price'), // 부분 매칭
    'price-amount': html.includes('price-amount'),
    'price__amount': html.includes('price__amount'),
    'unit-price': html.includes('unit-price'),
    'data-price=': html.includes('data-price='),
    'data-test="price"': html.includes('data-test="price"'),
    'b-price__final-price': html.includes('b-price__final-price'),
  };

  // ─── __NEXT_DATA__ 추출 시도 (있으면 가격 경로 탐색) ───
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const stringified = JSON.stringify(json);
      report.nextData = {
        size: stringified.length,
        has_price_key: /\"price\"/i.test(stringified),
        has_salePrice: stringified.includes('salePrice'),
        has_currentPrice: stringified.includes('currentPrice'),
        // 가격 경로 후보 탐색 — JSON 안에서 price 키와 value 추출 시도
        priceMatches: [...stringified.matchAll(/"(?:price|salePrice|currentPrice|totalPrice|finalPrice|displayPrice)"\s*:\s*"?(\d+(?:\.\d+)?)"?/g)]
          .slice(0, 10)
          .map((m) => `${m[0].slice(0, 60)}`),
      };
    } catch (e) {
      report.nextData = { parseError: e.message };
    }
  } else {
    report.nextData = null;
  }

  return report;
}

function summarize(prefix, r) {
  console.log(`\n=== ${prefix} ===`);
  console.log(`  HTTP ${r.status} | final=${r.finalUrl?.slice(0, 80)}`);
  console.log(`  HTML size=${r.length} | elapsed=${r.elapsed}ms`);
  if (!r.html) return;
  const report = inspectHtml(r.html);

  console.log('\n  [제목 셀렉터]');
  for (const [k, v] of Object.entries(report.title)) {
    const hit = v && (typeof v === 'string' ? v.slice(0, 50) : 'TRUE');
    console.log(`    ${k}: ${hit || 'MISS'}`);
  }

  console.log('\n  [가격 셀렉터 — 현재 SCRAPE_JS 순서대로]');
  for (const [k, v] of Object.entries(report.price)) {
    const hit = v && (typeof v === 'string' ? v : 'TRUE');
    console.log(`    ${k}: ${hit || 'MISS'}`);
  }

  console.log('\n  [이미지 셀렉터]');
  for (const [k, v] of Object.entries(report.image)) {
    const hit = v && (typeof v === 'string' ? v.slice(0, 80) : 'TRUE');
    console.log(`    ${k}: ${hit || 'MISS'}`);
  }

  console.log('\n  [SPA state 후보 — __NEXT_DATA__ 등]');
  for (const [k, v] of Object.entries(report.spaState)) {
    console.log(`    ${k}: ${v ? 'PRESENT' : 'MISS'}`);
  }

  console.log('\n  [차단/봇 신호]');
  console.log(`    body_short(<5000): ${report.blockSignals.body_short}`);
  console.log(`    captcha/forbidden: ${report.blockSignals.captcha}`);
  console.log(`    meta_count: ${report.blockSignals.meta_count}, script_count: ${report.blockSignals.script_count}`);

  console.log('\n  [가격 후보 패턴]');
  console.log(`    class*="price" 노드 수: ${report.priceCandidates['class*="price" 노드 수']}`);
  console.log(`    "N,NNN원" 매칭 총 ${report.priceCandidates['"N,NNN원" 매칭']}건, unique 상위:`);
  report.priceCandidates['unique 상위 15'].forEach((p) => console.log(`      ${p}`));

  console.log('\n  [모바일 페이지 추정 클래스 후보]');
  for (const [k, v] of Object.entries(report.mobileCandidates)) {
    console.log(`    ${k}: ${v ? 'PRESENT' : 'MISS'}`);
  }

  console.log('\n  [__NEXT_DATA__ 분석]');
  if (report.nextData) {
    if (report.nextData.parseError) {
      console.log(`    JSON parse 실패: ${report.nextData.parseError}`);
    } else if (report.nextData.size) {
      console.log(`    size=${report.nextData.size}`);
      console.log(`    has_price_key: ${report.nextData.has_price_key}`);
      console.log(`    has_salePrice: ${report.nextData.has_salePrice}`);
      console.log(`    has_currentPrice: ${report.nextData.has_currentPrice}`);
      console.log(`    price-related 매칭 상위 10:`);
      report.nextData.priceMatches.forEach((p) => console.log(`      ${p}`));
    }
  } else {
    console.log('    __NEXT_DATA__ 없음');
  }
}

console.log('=== 쿠팡 페이지 SCRAPE_JS 셀렉터 진단 (2026-05-12) ===');
for (const pid of PRODUCT_IDS) {
  const url = `https://www.coupang.com/vp/products/${pid}`;
  console.log(`\n\n############ productId=${pid} ############`);
  for (const [label, ua] of [
    ['iPhone Safari (현재 iOS UA)', IPHONE_UA],
    ['Android Chrome (현재 Android UA)', ANDROID_UA],
    ['Desktop Chrome (비교용)', DESKTOP_UA],
  ]) {
    const r = await fetchOnce(url, ua);
    if (!r.ok) {
      console.log(`\n=== ${label} ===\n  FETCH 실패: ${r.error}`);
      continue;
    }
    summarize(label, r);
  }
}
process.exit(0);
