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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

    // 상품 페이지로 리다이렉트 대기 (link.coupang.com → www.coupang.com)
    await page.waitForFunction(
      () =>
        window.location.href.includes('coupang.com/vp/products/') ||
        window.location.href.includes('coupang.com/vm/products/'),
      { timeout: 10000 },
    ).catch(() => {});

    await new Promise((r) => setTimeout(r, 2000));

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

    return result.price > 0 ? result : null;
  } catch (e) {
    console.error('[Scraper] 실패:', url, e);
    return null;
  } finally {
    await browser?.close();
  }
}
