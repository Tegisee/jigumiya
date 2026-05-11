import { useRef, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import WebView, {
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview';

export interface ScrapedProduct {
  title: string;
  price: number;
  image: string;
  resolvedUrl: string; // WebView 최종 도착 URL (www.coupang.com)
}

interface Props {
  url: string | null;
  html?: string | null;     // HTML 문자열 직접 로드 (Universal Link 우회)
  baseUrl?: string;          // html 사용 시 base URL
  onResult: (data: ScrapedProduct) => void;
  onError: () => void;
}

// 플랫폼별 UserAgent
const USER_AGENT = Platform.select({
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  default:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})!;

// 페이지 로드 전 coupang:// 딥링크 차단 — window.location 세터 오버라이드
// Android: intent://, market:// 추가 차단
const BLOCK_DEEPLINK_JS = `
(function() {
  var blocked = ['coupang://', 'coupangapp://', 'itms-appss://', 'intent://', 'market://'];
  var origLocation = window.location;
  try {
    Object.defineProperty(window.__proto__, 'location', {
      configurable: true,
      get: function() { return origLocation; },
      set: function(v) {
        if (typeof v === 'string') {
          for (var i = 0; i < blocked.length; i++) {
            if (v.startsWith(blocked[i])) return;
          }
        }
        origLocation.href = v;
      }
    });
  } catch(e) {}

  // Android: a태그 intent:// 클릭 차단
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (el && el.href) {
      for (var i = 0; i < blocked.length; i++) {
        if (el.href.startsWith(blocked[i])) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    }
  }, true);

  // 앱 열기 유도 팝업/배너 차단: 쿠팡 앱 다운로드/열기 배너 숨기기
  var style = document.createElement('style');
  style.textContent = '[class*="app-banner"], [class*="app-download"], [id*="app-banner"], .top-app-bar, .smart-banner { display: none !important; }';
  document.head.appendChild(style);
})();
true;
`;

// DOM에서 상품 정보 추출 + 내부 setInterval 폴링 (1.0.16 무한로딩 fix):
//   - 0.5s × 20회 = 10s 동안 가격/이미지 DOM 등장 대기 (쿠팡 SPA hydration 지연 흡수)
//   - 가격+이미지 둘 다 발견 시 즉시 SCRAPED postMessage + clearInterval
//   - 20회 소진 시 마지막 결과 postMessage (price=0이어도 외부가 재시도/실패 판단)
//   - window.__coupangPollHandle로 외부 재시도(2/4/6s) 시 이전 polling 정리 → 누적 방지
// 외부 재시도 구조는 그대로 유지 — 내부 폴링이 즉시 답 못 주는 케이스의 안전망.
const SCRAPE_JS = `
(function() {
  if (window.__coupangPollHandle) {
    clearInterval(window.__coupangPollHandle);
    window.__coupangPollHandle = null;
  }

  var attempts = 0;
  var MAX_ATTEMPTS = 20;
  var INTERVAL_MS = 500;

  function extractOnce() {
    var title = '';
    var titleSource = 'none';
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) { title = ogTitle.getAttribute('content') || ''; titleSource = 'og:title'; }
    if (!title) {
      var h2 = document.querySelector('h2.prod-buy-header__title, h1.prod-buy-header__title, .prod-buy-header__title');
      if (h2) { title = h2.textContent.trim(); titleSource = 'h2'; }
    }
    if (!title) {
      var metaTitle = document.querySelector('title');
      if (metaTitle) { title = metaTitle.textContent.trim(); titleSource = 'title-tag'; }
    }

    var price = 0;
    var priceSource = 'none';
    var totalPrice = document.querySelector('.total-price strong');
    if (totalPrice) {
      price = parseInt(totalPrice.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      if (price) priceSource = '.total-price strong';
    }
    if (!price) {
      var salePrice = document.querySelector('.prod-sale-price .total-price');
      if (salePrice) {
        price = parseInt(salePrice.textContent.replace(/[^0-9]/g, ''), 10) || 0;
        if (price) priceSource = '.prod-sale-price';
      }
    }
    if (!price) {
      var ogPrice = document.querySelector('meta[property="product:price:amount"]');
      if (ogPrice) {
        price = parseInt((ogPrice.getAttribute('content') || '').replace(/[^0-9]/g, ''), 10) || 0;
        if (price) priceSource = 'og:price';
      }
    }
    if (!price) {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var ld = JSON.parse(scripts[i].textContent);
          if (ld.offers && ld.offers.price) {
            price = parseInt(String(ld.offers.price).replace(/[^0-9]/g, ''), 10) || 0;
            if (price) { priceSource = 'ld+json'; break; }
          }
        } catch(e) {}
      }
    }

    var image = '';
    var imgSource = 'none';
    var ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) { image = ogImage.getAttribute('content') || ''; imgSource = 'og:image'; }
    if (!image) {
      var mainImg = document.querySelector('.prod-image__detail img, .prod-image img');
      if (mainImg) { image = mainImg.getAttribute('src') || ''; imgSource = 'dom-img'; }
    }
    if (image && image.startsWith('//')) image = 'https:' + image;

    title = title.replace(/\\s*[|\\-].*$/, '').trim();

    return {
      title: title,
      price: price,
      image: image,
      titleSource: titleSource,
      priceSource: priceSource,
      imgSource: imgSource,
    };
  }

  function stopPolling() {
    if (window.__coupangPollHandle) {
      clearInterval(window.__coupangPollHandle);
      window.__coupangPollHandle = null;
    }
  }

  function tick() {
    attempts++;
    try {
      var r = extractOnce();
      var hasFull = r.price > 0 && r.image;
      var lastTry = attempts >= MAX_ATTEMPTS;

      if (hasFull || lastTry) {
        stopPolling();
        var bodyLen = document.body ? document.body.innerHTML.length : 0;
        var metaCount = document.querySelectorAll('meta').length;
        var readyState = document.readyState;
        var debug =
          'T:' + r.titleSource + (r.title ? '=' + r.title.slice(0,30) : '=EMPTY') + ' | ' +
          'P:' + r.priceSource + '=' + r.price + ' | ' +
          'I:' + r.imgSource + (r.image ? '=OK' : '=EMPTY') + ' | ' +
          'attempts=' + attempts + '/' + MAX_ATTEMPTS + ' | ' +
          'body=' + bodyLen + ' meta=' + metaCount + ' ready=' + readyState + ' | ' +
          'url=' + window.location.href.slice(0,100);

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SCRAPED',
          url: window.location.href,
          title: r.title,
          price: r.price,
          image: r.image,
          debug: debug,
        }));
      }
    } catch(e) {
      stopPolling();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ERROR',
        message: e.message,
        stack: (e.stack || '').slice(0, 200),
      }));
    }
  }

  window.__coupangPollHandle = setInterval(tick, INTERVAL_MS);
  tick(); // 즉시 1회 — hydration 이미 끝났을 가능성 대비
})();
true;
`;


// iOS: Universal Link로 쿠팡 앱이 열리지만, WebView는 백그라운드에서 로딩 완료
// → 앱 복귀 시 스크래핑 데이터 자동 처리

export default function CoupangScraper({ url, html, baseUrl, onResult, onError }: Props) {
  const webViewRef = useRef<WebView>(null);
  const doneRef = useRef(false);
  const injectedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 단계적 재시도: 2초, 4초, 6초 (sourceKey reset 블록에서 참조하므로 위로 이동)
  const retryDelays = [2000, 4000, 6000];
  const retryIndexRef = useRef(0);

  // iOS/Android 공통: URL 직접 로드
  const activeHtml = html || null;
  const activeBaseUrl = baseUrl || undefined;
  const activeUrl = activeHtml ? null : url;

  const sourceKey = activeHtml ? `html:${activeHtml.length}` : activeUrl;
  const prevKeyRef = useRef(sourceKey);
  if (sourceKey && sourceKey !== prevKeyRef.current) {
    prevKeyRef.current = sourceKey;
    doneRef.current = false;
    injectedRef.current = false;
    retryIndexRef.current = 0;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    console.log('[Scraper] step2: WebView 시작! sourceKey=', typeof sourceKey === 'string' ? sourceKey.slice(0, 80) : sourceKey);
    // 20초 타임아웃
    timeoutRef.current = setTimeout(() => {
      if (!doneRef.current) {
        console.warn('[Scraper] 타임아웃 (20초) — retry:', retryIndexRef.current);
        doneRef.current = true;
        onError();
      }
    }, 20000);
  }

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      console.log('[Scraper] step5: postMessage 수신! done=', doneRef.current);
      if (doneRef.current) return;
      try {
        const data = JSON.parse(event.nativeEvent.data);
        console.log(`[Scraper] step5: price=${data.price} image=${data.image ? 'OK' : 'EMPTY'} title=${(data.title || '').slice(0, 30)} type=${data.type}`);
        if (data.debug) console.log('[Scraper] 디버그:', data.debug);

        if (data.type === 'SCRAPED' && data.price > 0 && data.image) {
          // 가격 + 이미지 모두 있어야 성공
          console.log('[Scraper] 성공 — 가격+이미지 완료');
          doneRef.current = true;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          onResult({
            title: data.title || '',
            price: data.price || 0,
            image: data.image || '',
            resolvedUrl: data.url || '',
          });
        } else if (data.type === 'SCRAPED' && data.price > 0 && !data.image) {
          // 가격은 있지만 이미지 없음
          if (retryIndexRef.current < retryDelays.length) {
            console.log('[Scraper] 가격O 이미지X — 재시도 예약');
            injectedRef.current = false;
            scheduleInject();
          } else {
            console.log('[Scraper] 가격O 이미지X — 재시도 소진, 가격만으로 완료');
            doneRef.current = true;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            onResult({
              title: data.title || '',
              price: data.price || 0,
              image: '',
              resolvedUrl: data.url || '',
            });
          }
        } else if (data.type === 'SCRAPED' && data.price === 0) {
          // 가격 없음
          if (retryIndexRef.current < retryDelays.length) {
            console.log('[Scraper] 가격X — 재시도 예약');
            injectedRef.current = false;
            scheduleInject();
          } else {
            // 외부 20s timeout 의존하지 말고 즉시 onError — iOS 무한로딩 fix
            console.warn('[Scraper] 가격X — 재시도 소진, onError 호출');
            doneRef.current = true;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            onError();
          }
        } else if (data.type === 'ERROR') {
          console.error('[Scraper] JS 에러:', data.message, data.stack);
          doneRef.current = true;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          onError();
        }
      } catch {
        // 파싱 실패 무시
      }
    },
    [onResult, onError]
  );

  const scheduleInject = useCallback(() => {
    if (doneRef.current || injectedRef.current) return;
    const idx = retryIndexRef.current;
    const delay = retryDelays[idx] ?? retryDelays[retryDelays.length - 1];
    retryIndexRef.current++;
    injectedRef.current = true;
    console.log(`[Scraper] step4: 인젝션 예약 #${idx} (${delay}ms 후)`);
    setTimeout(() => {
      if (!doneRef.current && webViewRef.current) {
        console.log(`[Scraper] step4: 인젝션 실행 #${idx}`);
        webViewRef.current.injectJavaScript(SCRAPE_JS);
      }
    }, delay);
  }, []);

  const tryInject = useCallback(() => {
    if (doneRef.current || injectedRef.current) return;
    retryIndexRef.current = 0;
    scheduleInject();
  }, [scheduleInject]);

  const handleNavigationChange = useCallback(
    (navState: WebViewNavigation) => {
      if (doneRef.current) return;

      const navUrl = navState.url || '';
      console.log(`[Scraper] step3: nav loading=${navState.loading} url=${navUrl.slice(0, 80)}`);

      const isProductPage =
        navUrl.includes('coupang.com/vp/products/') ||
        navUrl.includes('coupang.com/vm/products/');

      if (isProductPage && !navState.loading) {
        console.log('[Scraper] 상품 페이지 감지 → 인젝션 시작');
        tryInject();
      }
    },
    [tryInject]
  );

  const handleLoadEnd = useCallback(() => {
    console.log('[Scraper] onLoadEnd');
    if (doneRef.current || injectedRef.current) return;
    if (activeHtml) {
      injectedRef.current = true;
      setTimeout(() => {
        if (!doneRef.current && webViewRef.current) {
          webViewRef.current.injectJavaScript(SCRAPE_JS);
        }
      }, 1000);
    } else {
      tryInject();
    }
  }, [tryInject, activeHtml]);

  const handleError = useCallback((syntheticEvent: any) => {
    console.error('[Scraper] WebView 에러:', syntheticEvent.nativeEvent?.description, syntheticEvent.nativeEvent?.code);
  }, []);

  const handleHttpError = useCallback((syntheticEvent: any) => {
    console.error('[Scraper] HTTP 에러:', syntheticEvent.nativeEvent?.statusCode, syntheticEvent.nativeEvent?.url?.slice(0, 80));
  }, []);

  // 딥링크 및 앱 리다이렉트 차단 + coupang.com은 WebView 내 처리 강제
  const handleShouldStartLoad = useCallback((event: { url: string; navigationType?: string; lockIdentifier?: number }) => {
    const reqUrl = event.url;
    console.log(`[Scraper] shouldStartLoad: type=${event.navigationType} url=${reqUrl.slice(0, 80)}`);
    // 쿠팡 앱 딥링크 명시적 차단
    if (reqUrl.startsWith('coupang://') || reqUrl.startsWith('coupangapp://')) {
      console.log('[Scraper] 차단: 쿠팡 앱 딥링크 →', reqUrl.slice(0, 60));
      return false;
    }
    // 비-HTTP 스킴 차단 (intent://, market://, itms-appss:// 등)
    if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) {
      console.log('[Scraper] 차단: 비-HTTP 스킴 →', reqUrl.slice(0, 60));
      return false;
    }
    try {
      const host = new URL(reqUrl).hostname;
      // 앱스토어/앱링크/Universal Link 차단
      // link.coupang.com: iOS Universal Link로 쿠팡 앱 강제 실행 → 무한로딩 (1.0.16 fix)
      // applink.coupang.com: 동일 (alternate)
      if (
        host === 'link.coupang.com' ||
        host === 'applink.coupang.com' ||
        host === 'play.google.com' ||
        host === 'apps.apple.com' ||
        host === 'itunes.apple.com'
      ) {
        console.log('[Scraper] 차단:', host);
        return false;
      }
      // coupang.com 도메인은 무조건 WebView 내에서 처리 (Universal Link 팝업 방지)
      if (host.endsWith('coupang.com')) {
        return true;
      }
    } catch {}
    return true;
  }, []);

  if (!activeUrl && !activeHtml) {
    console.log('[Scraper] WebView 미렌더 (activeUrl/activeHtml 모두 null)');
    return null;
  }
  console.log('[Scraper] WebView 렌더! source=', activeHtml ? 'html' : activeUrl?.slice(0, 80));

  const source = activeHtml
    ? { html: activeHtml, baseUrl: activeBaseUrl || 'https://www.coupang.com' }
    : { uri: activeUrl! };

  return (
    <View style={styles.hidden}>
      <WebView
        ref={webViewRef}
        source={source}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationChange}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleHttpError}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        originWhitelist={['https://*', 'http://*']}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        allowsLinkPreview={false}
        allowsBackForwardNavigationGestures={false}
        {...(Platform.OS === 'ios' ? { dataDetectorTypes: 'none' } : {})}
        suppressesIncrementalRendering={true}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={BLOCK_DEEPLINK_JS}
        userAgent={USER_AGENT}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 300,
    height: 400,
    opacity: 0,
    pointerEvents: 'none',
  },
});
