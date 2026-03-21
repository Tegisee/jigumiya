import { useState, useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import CoupangScraper, { ScrapedProduct } from './CoupangScraper';
import { useAppStore } from '../store/useAppStore';
import { TrackedItem } from '../types';

const NOTIFICATION_MESSAGES = [
  '찜해둔 상품이 목표가 밑으로 떨어졌어요!',
  '드디어 때가 왔습니다. 결제하러 가실 시간이에요!',
  '헉! 방금 가격 내려갔어요. 언제 다시 오를지 몰라요!',
  '잊고 계셨죠? 찜해둔 그 아이템, 지금이 줍줍할 타이밍!',
];

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FETCH_HEADERS = {
  'User-Agent': MOBILE_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://www.coupang.com',
};

/**
 * URL에서 실제 www.coupang.com 상품 URL 추출
 * link.coupang.com → fetch → Deeplink Redirect HTML에서 rUrl/landingUrl/상품URL 파싱
 */
async function resolveProductUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    // 이미 직접 상품 URL이면 그대로
    if (
      (parsed.hostname === 'www.coupang.com' || parsed.hostname === 'm.coupang.com') &&
      (url.includes('/vp/products/') || url.includes('/vm/products/'))
    ) {
      return url;
    }

    console.log(`[PriceChecker] URL resolve: ${url.slice(0, 60)}`);
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });
    if (!res.ok) return url;

    const html = await res.text();
    console.log(`[PriceChecker] redirect HTML ${html.length}자`);

    // 1) URL 파라미터에서 추출 (rUrl, landingUrl 등)
    const paramMatch = html.match(/[?&](?:rUrl|landingUrl|url|redirect_url)=([^&"'\s]+)/i);
    if (paramMatch) {
      const decoded = decodeURIComponent(paramMatch[1]);
      if (decoded.includes('coupang.com') && (decoded.includes('/vp/products/') || decoded.includes('/vm/products/'))) {
        console.log(`[PriceChecker] 파라미터에서 추출: ${decoded.slice(0, 80)}`);
        return decoded;
      }
    }

    // 2) HTML 전체에서 www.coupang.com/vp/products/XXX 패턴 추출
    const productUrlMatch = html.match(/https?:\/\/(?:www|m)\.coupang\.com\/v[pm]\/products\/\d+[^"'\s<]*/);
    if (productUrlMatch) {
      const extracted = productUrlMatch[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
      console.log(`[PriceChecker] HTML에서 상품URL 추출: ${extracted.slice(0, 80)}`);
      return extracted;
    }

    // 3) meta refresh에서 추출
    const metaMatch = html.match(/content=["'][^"']*url=(https?:\/\/[^"'\s]+)/i);
    if (metaMatch && metaMatch[1].includes('coupang.com')) {
      console.log(`[PriceChecker] meta refresh에서 추출: ${metaMatch[1].slice(0, 80)}`);
      return metaMatch[1];
    }

    // 4) res.url (fetch redirect follow 후 최종 URL)
    if (res.url && res.url.includes('coupang.com') && (res.url.includes('/vp/products/') || res.url.includes('/vm/products/'))) {
      console.log(`[PriceChecker] fetch 최종 URL: ${res.url.slice(0, 80)}`);
      return res.url;
    }

    console.log(`[PriceChecker] 상품URL 추출 실패, 원본 사용`);
  } catch (e: any) {
    console.log(`[PriceChecker] resolve 실패: ${e.message}`);
  }
  return url;
}

/** 상품 URL로 HTML fetch — WebView에 직접 로드용 */
async function fetchProductHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    // 실제 상품 페이지인지 확인 (meta tag 또는 상품 관련 키워드)
    if (html.length < 5000 || (!html.includes('og:title') && !html.includes('product:price'))) {
      console.log(`[PriceChecker] 상품 HTML 아님: ${html.length}자`);
      return null;
    }
    console.log(`[PriceChecker] 상품 HTML fetch 성공: ${html.length}자\n[PriceChecker] 미리보기: ${html.slice(0, 500)}`);
    return html;
  } catch {
    return null;
  }
}

/** 포그라운드 가격 체크 — fetch HTML → WebView 파싱 (Universal Link 우회) */
export default function PriceChecker({ active }: { active: boolean }) {
  const { trackedItems, updateItemPrice, notificationEnabled } = useAppStore();
  const [scrapeUrl, setScrapeUrl] = useState<string | null>(null);
  const [scrapeHtml, setScrapeHtml] = useState<string | null>(null);
  const [scrapeBaseUrl, setScrapeBaseUrl] = useState<string | undefined>(undefined);
  const queueRef = useRef<TrackedItem[]>([]);
  const currentItemRef = useRef<TrackedItem | null>(null);
  const runningRef = useRef(false);

  const processNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      runningRef.current = false;
      currentItemRef.current = null;
      setScrapeUrl(null);
      setScrapeHtml(null);
      console.log('[PriceChecker] 완료');
      return;
    }

    const item = queueRef.current.shift()!;
    currentItemRef.current = item;
    console.log(`[PriceChecker] 체크: ${item.productName?.slice(0, 30)}`);

    // 리셋
    setScrapeUrl(null);
    setScrapeHtml(null);

    // 1단계: 실제 상품 URL resolve (link.coupang.com → www.coupang.com)
    const productUrl = await resolveProductUrl(item.resolvedUrl || item.url);

    // resolvedUrl 자동 저장
    if (productUrl !== item.url && !item.resolvedUrl) {
      const { trackedItems: items } = useAppStore.getState();
      useAppStore.setState({
        trackedItems: items.map((i) =>
          i.id === item.id ? { ...i, resolvedUrl: productUrl } : i,
        ),
      });
    }

    // 2단계: 상품 HTML fetch → WebView에 직접 로드 (Universal Link 우회)
    const html = await fetchProductHtml(productUrl);

    setTimeout(() => {
      if (html) {
        console.log('[PriceChecker] HTML 모드로 로드');
        setScrapeBaseUrl(productUrl);
        setScrapeHtml(html);
      } else {
        // fetch 실패 시 기존 URL 방식 fallback (resolvedUrl 사용)
        console.log('[PriceChecker] URL fallback:', productUrl.slice(0, 60));
        setScrapeUrl(productUrl);
      }
    }, 300);
  }, []);

  // active가 true로 바뀌면 체크 시작
  useEffect(() => {
    if (!active || runningRef.current || trackedItems.length === 0) return;

    const realItems = trackedItems.filter((i) => !i.id.startsWith('mock-'));
    if (realItems.length === 0) return;

    console.log(`[PriceChecker] 시작: ${realItems.length}개 상품 (5초 후)`);
    runningRef.current = true;
    queueRef.current = [...realItems];
    setTimeout(processNext, 5000);
  }, [active, trackedItems, processNext]);

  const handleResult = useCallback(
    async (data: ScrapedProduct) => {
      const item = currentItemRef.current;
      if (!item) return;

      const prevPrice = item.currentPrice;
      const newPrice = data.price;

      console.log(
        `[PriceChecker] ${item.productName?.slice(0, 20)}: ${prevPrice.toLocaleString()} → ${newPrice.toLocaleString()}원`,
      );

      if (newPrice > 0 && newPrice !== prevPrice) {
        updateItemPrice(item.id, newPrice);
      }

      // 목표가 달성 로컬 푸시
      if (
        notificationEnabled &&
        newPrice > 0 &&
        newPrice <= item.targetPrice &&
        prevPrice > item.targetPrice
      ) {
        const body =
          NOTIFICATION_MESSAGES[Math.floor(Math.random() * NOTIFICATION_MESSAGES.length)];
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '지금이야',
            body: `${item.productName?.slice(0, 30)} ${newPrice.toLocaleString()}원 — ${body}`,
            data: { itemId: item.id, screen: 'detail' },
          },
          trigger: null,
        });
      }

      setTimeout(processNext, 1000);
    },
    [updateItemPrice, notificationEnabled, processNext],
  );

  const handleError = useCallback(() => {
    console.log(
      `[PriceChecker] 실패: ${currentItemRef.current?.productName?.slice(0, 20)}`,
    );
    setTimeout(processNext, 1000);
  }, [processNext]);

  return (
    <CoupangScraper
      url={scrapeUrl}
      html={scrapeHtml}
      baseUrl={scrapeBaseUrl}
      onResult={handleResult}
      onError={handleError}
    />
  );
}
