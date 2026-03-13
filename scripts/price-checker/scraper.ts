import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface ScrapedPrice {
  price: number;
  title: string;
  image: string;
}

/** Puppeteer로 쿠팡 상품 페이지에서 가격 추출 */
export async function scrapePrice(url: string): Promise<ScrapedPrice | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });
    const page = await browser.newPage();

    // 데스크톱 Chrome UA (모바일보다 차단 덜함)
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );

    // webdriver 속성 제거
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`[Scraper] 페이지 로드: ${url.slice(0, 80)}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const currentUrl = page.url();
    console.log(`[Scraper] 현재 URL: ${currentUrl.slice(0, 100)}`);

    // 상품 페이지로 리다이렉트 대기
    const isProductPage =
      currentUrl.includes('coupang.com/vp/products/') ||
      currentUrl.includes('coupang.com/vm/products/');

    if (!isProductPage) {
      await page
        .waitForFunction(
          () =>
            window.location.href.includes('coupang.com/vp/products/') ||
            window.location.href.includes('coupang.com/vm/products/'),
          { timeout: 10000 },
        )
        .catch(() => {
          console.log(`[Scraper] 상품 페이지 도달 실패, 현재: ${page.url().slice(0, 100)}`);
        });
    }

    // 페이지 렌더링 대기
    await new Promise((r) => setTimeout(r, 3000));

    const finalUrl = page.url();
    console.log(`[Scraper] 최종 URL: ${finalUrl.slice(0, 100)}`);

    // 페이지 HTML 길이 확인 (봇 차단 페이지는 매우 짧음)
    const htmlLength = await page.evaluate(() => document.documentElement.outerHTML.length);
    console.log(`[Scraper] HTML 길이: ${htmlLength}`);

    if (htmlLength < 5000) {
      console.log('[Scraper] HTML 너무 짧음 — 봇 차단 페이지 가능성');
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
      console.log(`[Scraper] 본문: ${bodyText}`);
      return null;
    }

    const result = await page.evaluate(() => {
      let title = '';
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) title = ogTitle.getAttribute('content') || '';
      if (!title) {
        const h2 = document.querySelector(
          'h2.prod-buy-header__title, h1.prod-buy-header__title, .prod-buy-header__title',
        );
        if (h2) title = (h2 as HTMLElement).textContent?.trim() || '';
      }
      if (!title) {
        const metaTitle = document.querySelector('title');
        if (metaTitle) title = metaTitle.textContent?.trim() || '';
      }

      let price = 0;
      const totalPrice = document.querySelector('.total-price strong');
      if (totalPrice) {
        price =
          parseInt(
            (totalPrice as HTMLElement).textContent!.replace(/[^0-9]/g, ''),
            10,
          ) || 0;
      }
      if (!price) {
        // 데스크톱 셀렉터
        const pbPrice = document.querySelector('.prod-price .total-price strong');
        if (pbPrice) {
          price = parseInt(
            (pbPrice as HTMLElement).textContent!.replace(/[^0-9]/g, ''),
            10,
          ) || 0;
        }
      }
      if (!price) {
        const ogPrice = document.querySelector(
          'meta[property="product:price:amount"]',
        );
        if (ogPrice)
          price =
            parseInt(
              (ogPrice.getAttribute('content') || '').replace(/[^0-9]/g, ''),
              10,
            ) || 0;
      }
      if (!price) {
        const scripts = document.querySelectorAll(
          'script[type="application/ld+json"]',
        );
        for (const s of scripts) {
          try {
            const ld = JSON.parse(s.textContent || '');
            if (ld.offers?.price) {
              price =
                parseInt(
                  String(ld.offers.price).replace(/[^0-9]/g, ''),
                  10,
                ) || 0;
              if (price) break;
            }
          } catch {}
        }
      }

      let image = '';
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) image = ogImage.getAttribute('content') || '';
      if (image && image.startsWith('//')) image = 'https:' + image;

      title = title.replace(/\s*[|\-].*$/, '').trim();

      return { price, title, image };
    });

    console.log(
      `[Scraper] 결과: 제목=${result.title?.slice(0, 30)} 가격=${result.price}`,
    );

    return result.price > 0 ? result : null;
  } catch (e) {
    console.error('[Scraper] 실패:', url, e);
    return null;
  } finally {
    await browser?.close();
  }
}
