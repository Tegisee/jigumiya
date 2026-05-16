import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import WebView, {
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview';
import type {
  WebViewNavigationEvent,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  ShouldStartLoadRequest,
} from 'react-native-webview/lib/WebViewTypes';

/**
 * 1.0.20+ Android 전용 메타 추출 fallback (docs/026 후속).
 *
 * 발동 조건 (부모 책임):
 *   - Platform.OS === 'android'
 *   - Functions + searchProducts fallback 모두 실패하여 메타 빈값
 *   - vp/vm URL 확보 + m.coupang.com 도메인으로 변환된 url을 prop으로 전달
 *
 * 동작:
 *   - silent 백그라운드 — 사용자 UI 영향 X (0x0 크기, opacity 0)
 *   - 10초 timeout — 실패 시 onTimeout 호출 (부모가 unmount)
 *   - DOM 도착 → SCRAPE_JS 주입 → OG/ld+json 우선 파싱 → postMessage
 *   - 추출 완료 즉시 onMeta 호출 (부모가 unmount)
 *
 * 1.0.15 CoupangScraper.tsx 부활 + navigator.webdriver 우회 추가.
 */

export interface ScrapedMeta {
  productName?: string;
  productImage?: string;
  apiPrice?: number;
}

interface Props {
  /** m.coupang.com vp URL. null이면 마운트 안 됨 (부모가 강제 unmount용으로 사용). */
  url: string | null;
  /** 추출 성공 시 콜백. 부모는 즉시 url=null로 setState하여 unmount. */
  onMeta: (meta: ScrapedMeta) => void;
  /** 10초 timeout 또는 WebView 에러. silent fail — 부모는 url=null로 unmount. */
  onTimeout: () => void;
}

const TIMEOUT_MS = 10_000;

// 갤럭시 환경 우회 — Galaxy S24 Chrome (실제 사용자 디바이스와 일치, fingerprint 자연도 ↑)
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

// 페이지 로드 전 주입:
//   1. navigator.webdriver 우회 — Akamai 봇 분류 회피
//   2. 딥링크 차단 — coupang://, intent://, market://, itms-appss:// 시도 무력화
//   3. 앱 다운로드 배너 숨김
const PRELOAD_JS = `
(function() {
  try {
    Object.defineProperty(navigator, 'webdriver', {
      configurable: true,
      get: function() { return undefined; }
    });
  } catch(e) {}

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

  var style = document.createElement('style');
  style.textContent = '[class*="app-banner"], [class*="app-download"], [id*="app-banner"], .top-app-bar, .smart-banner { display: none !important; }';
  if (document.head) document.head.appendChild(style);
})();
true;
`;

// 1.0.21 — DOM 도착 후 자체 폴링 (0.5s × 최대 8회). bodyLen >= 10000 도달 또는 max 시 1회 postMessage.
// 쿠팡 SPA hydration이 1.5s 단발 inject보다 늦게 끝나는 케이스 대응. OG/ld+json 우선, 1.0.15 셀렉터 fallback.
const SCRAPE_JS = `
(function() {
  if (window.__metaPollHandle) {
    clearInterval(window.__metaPollHandle);
    window.__metaPollHandle = null;
  }
  var attempts = 0;
  var MAX_ATTEMPTS = 8;
  var BODY_LEN_THRESHOLD = 10000;
  var done = false;

  function extractAndSend() {
    try {
      // ── Title ──
      var title = '';
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) title = ogTitle.getAttribute('content') || '';
      if (!title) {
        var h2 = document.querySelector('h2.prod-buy-header__title, h1.prod-buy-header__title, .prod-buy-header__title');
        if (h2) title = h2.textContent.trim();
      }
      if (!title) {
        var t = document.querySelector('title');
        if (t) title = t.textContent.trim();
      }
      title = title.replace(/\\s*[|\\-]\\s*쿠팡.*$/, '').trim();

      // ── Price ──
      var price = 0;
      var ogPrice = document.querySelector('meta[property="product:price:amount"]');
      if (ogPrice) {
        price = parseInt((ogPrice.getAttribute('content') || '').replace(/[^0-9]/g, ''), 10) || 0;
      }
      if (!price) {
        var scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (var i = 0; i < scripts.length; i++) {
          try {
            var ld = JSON.parse(scripts[i].textContent);
            if (ld && ld.offers && ld.offers.price) {
              price = parseInt(String(ld.offers.price).replace(/[^0-9]/g, ''), 10) || 0;
              if (price) break;
            }
          } catch(e) {}
        }
      }
      if (!price) {
        var totalPrice = document.querySelector('.total-price strong');
        if (totalPrice) price = parseInt(totalPrice.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      }
      if (!price) {
        var salePrice = document.querySelector('.prod-sale-price .total-price');
        if (salePrice) price = parseInt(salePrice.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      }

      // ── Image ──
      var image = '';
      var ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) image = ogImage.getAttribute('content') || '';
      if (!image) {
        var mainImg = document.querySelector('.prod-image__detail img, .prod-image img');
        if (mainImg) image = mainImg.getAttribute('src') || '';
      }
      if (image && image.startsWith('//')) image = 'https:' + image;

      var titleTagEl = document.querySelector('title');
      var h1El = document.querySelector('h1');
      var bodyHtml = document.body ? document.body.innerHTML : '';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'META',
        title: title,
        price: price,
        image: image,
        ready: document.readyState,
        url: window.location.href.slice(0, 120),
        attempts: attempts,
        debug: {
          titleTag: titleTagEl ? (titleTagEl.textContent || '').slice(0, 60) : '',
          metaCount: document.querySelectorAll('meta').length,
          ogCount: document.querySelectorAll('meta[property^="og:"]').length,
          ldJsonCount: document.querySelectorAll('script[type="application/ld+json"]').length,
          bodyLen: bodyHtml.length,
          h1Text: h1El ? (h1El.textContent || '').slice(0, 60) : '',
          appBannerPresent: !!document.querySelector('[class*="app-banner"], [class*="app-download"]'),
        },
      }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ERROR',
        message: e.message,
        attempts: attempts,
      }));
    }
  }

  function probe() {
    if (done) return;
    attempts++;
    try {
      var bodyHtml = document.body ? document.body.innerHTML : '';
      var bodyLen = bodyHtml.length;
      if (bodyLen >= BODY_LEN_THRESHOLD || attempts >= MAX_ATTEMPTS) {
        done = true;
        if (window.__metaPollHandle) {
          clearInterval(window.__metaPollHandle);
          window.__metaPollHandle = null;
        }
        extractAndSend();
      }
      // 아직 부족 → 다음 setInterval 호출 대기
    } catch(e) {
      done = true;
      if (window.__metaPollHandle) {
        clearInterval(window.__metaPollHandle);
        window.__metaPollHandle = null;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ERROR',
        message: e.message,
        attempts: attempts,
      }));
    }
  }

  // 즉시 1회 시도 (bodyLen 이미 충분하면 첫 호출에 종료)
  probe();
  if (!done) {
    window.__metaPollHandle = setInterval(probe, 500);
  }
})();
true;
`;

function AndroidMetaScraperImpl({ url, onMeta, onTimeout }: Props) {
  // 1.0.21 디버깅: 컴포넌트 render마다 url prop 추적 (mount/unmount 가시화)
  console.log(
    `[AndroidMetaScraper] render: url=${url ? url.slice(0, 100) : '<null>'} platform=${Platform.OS}`,
  );

  const webViewRef = useRef<WebView>(null);
  const doneRef = useRef(false);
  const injectedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 1.0.21 — 403 fallback (m.coupang.com → www.coupang.com 1회).
  // 부모가 보내는 url을 그대로 시도하다가 403이면 도메인 swap 후 재로드.
  const fallbackUsedRef = useRef(false);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);

  // url 변경 시 상태 리셋 + 10s timeout 시작.
  // 1.0.21 fix: 초기값 null로 — 이전엔 useRef(url)로 첫 mount 시 ref가 url과 같아
  //   if 조건 false → timeout 미시작 → 페이지 로드 실패 시 영구 잔존 버그.
  const prevUrlRef = useRef<string | null>(null);
  if (url && url !== prevUrlRef.current) {
    prevUrlRef.current = url;
    doneRef.current = false;
    injectedRef.current = false;
    fallbackUsedRef.current = false;
    setRetryUrl(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        console.warn('[AndroidMetaScraper] timeout 10s — silent fail');
        onTimeout();
      }
    }, TIMEOUT_MS);
  }

  // WebView source에 실제 사용할 URL — retryUrl 우선
  const effectiveUrl = retryUrl ?? url;

  // unmount 시 timer 정리
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data ?? '';
      console.log(
        `[AndroidMetaScraper] postMessage raw (len=${raw.length}):`,
        raw.slice(0, 240),
      );
      if (doneRef.current) return;
      try {
        const data = JSON.parse(raw);
        if (data.type === 'ERROR') {
          console.warn('[AndroidMetaScraper] JS error:', data.message);
          // 에러는 timeout에 맡김 (silent retry 여지)
          return;
        }
        if (data.type !== 'META') return;

        if (data.debug) {
          console.log(
            `[AndroidMetaScraper] page debug: attempts=${data.attempts ?? '?'} ready=${data.ready} url=${data.url} ` +
              `titleTag="${data.debug.titleTag}" h1="${data.debug.h1Text}" ` +
              `meta=${data.debug.metaCount} og=${data.debug.ogCount} ldJson=${data.debug.ldJsonCount} ` +
              `bodyLen=${data.debug.bodyLen} appBanner=${data.debug.appBannerPresent}`,
          );
        }

        const price = Number(data.price) || 0;
        const image = String(data.image || '');
        const title = String(data.title || '');

        // 가격 또는 이미지 둘 중 하나라도 잡혔으면 결과 반환
        // (모바일 페이지 SSR이 가격은 클라이언트 렌더라 OG만 잡힐 수도 있음 — 이미지만 채워도 가치)
        if (price > 0 || image) {
          doneRef.current = true;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          console.log(
            `[AndroidMetaScraper] success — name=${!!title} img=${!!image} price=${price}`,
          );
          onMeta({
            productName: title || undefined,
            productImage: image || undefined,
            apiPrice: price > 0 ? price : undefined,
          });
        }
        // 아직 부족하면 timeout까지 대기 (페이지 추가 렌더 가능)
      } catch {
        // 파싱 실패 무시
      }
    },
    [onMeta],
  );

  const tryInject = useCallback(() => {
    if (doneRef.current || injectedRef.current) return;
    injectedRef.current = true;
    // 1.0.21: SCRAPE_JS 내부에서 0.5s × 최대 8회 폴링하므로 외부 지연 최소화 (300ms).
    setTimeout(() => {
      if (!doneRef.current && webViewRef.current) {
        webViewRef.current.injectJavaScript(SCRAPE_JS);
      }
    }, 300);
  }, []);

  const handleNavigationChange = useCallback(
    (navState: WebViewNavigation) => {
      if (doneRef.current) return;
      const navUrl = navState.url || '';
      const isProductPage =
        navUrl.includes('coupang.com/vp/products/') ||
        navUrl.includes('coupang.com/vm/products/');
      console.log(
        `[AndroidMetaScraper] nav: loading=${navState.loading} isProductPage=${isProductPage} url=${navUrl.slice(0, 120)}`,
      );
      if (isProductPage && !navState.loading) {
        tryInject();
      }
    },
    [tryInject],
  );

  const handleLoadStart = useCallback((event: WebViewNavigationEvent) => {
    console.log(
      '[AndroidMetaScraper] onLoadStart:',
      event.nativeEvent.url?.slice(0, 120),
    );
  }, []);

  const handleLoadEnd = useCallback(
    (event: WebViewNavigationEvent | WebViewErrorEvent) => {
      const ne = event.nativeEvent;
      console.log(
        `[AndroidMetaScraper] onLoadEnd: url=${ne.url?.slice(0, 120)} loading=${'loading' in ne ? ne.loading : 'n/a'}`,
      );
      if (doneRef.current || injectedRef.current) return;
      tryInject();
    },
    [tryInject],
  );

  const handleError = useCallback((event: WebViewErrorEvent) => {
    if (doneRef.current) return;
    const ne = event.nativeEvent;
    console.warn('[AndroidMetaScraper] WebView error:', {
      code: ne.code,
      desc: ne.description,
      url: ne.url?.slice(0, 120),
    });
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    if (doneRef.current) return;
    const ne = event.nativeEvent;
    const status = ne.statusCode;
    const failedUrl = ne.url ?? '';
    console.warn('[AndroidMetaScraper] HTTP error:', {
      status,
      desc: ne.description,
      url: failedUrl.slice(0, 120),
    });

    // 1.0.21 — 403 + m.coupang.com이면 www.coupang.com으로 1회 재로드 (Akamai 모바일 차단 회피)
    if (
      status === 403 &&
      !fallbackUsedRef.current &&
      failedUrl.includes('m.coupang.com')
    ) {
      const wwwUrl = failedUrl.replace(
        /\/\/m\.coupang\.com\//,
        '//www.coupang.com/',
      );
      fallbackUsedRef.current = true;
      injectedRef.current = false; // 재로드 시 SCRAPE_JS 재주입 허용
      console.warn(
        '[AndroidMetaScraper] 403 fallback: m. → www.',
        wwwUrl.slice(0, 120),
      );
      setRetryUrl(wwwUrl);
    }
  }, []);

  const handleShouldStartLoad = useCallback((request: ShouldStartLoadRequest) => {
    const reqUrl = request.url || '';
    const blockedPrefixes = [
      'coupang://',
      'coupangapp://',
      'itms-appss://',
      'intent://',
      'market://',
    ];
    const isBlocked = blockedPrefixes.some((b) => reqUrl.startsWith(b));
    if (isBlocked) {
      console.warn(
        '[AndroidMetaScraper] onShouldStartLoad 차단 (딥링크):',
        reqUrl.slice(0, 120),
      );
      return false;
    }
    if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) {
      console.warn(
        '[AndroidMetaScraper] onShouldStartLoad 차단 (비-http):',
        reqUrl.slice(0, 120),
      );
      return false;
    }
    return true;
  }, []);

  if (!url || Platform.OS !== 'android') return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ uri: effectiveUrl ?? url }}
        userAgent={USER_AGENT}
        injectedJavaScriptBeforeContentLoaded={PRELOAD_JS}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationChange}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleHttpError}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
        incognito={false}
        cacheEnabled={false}
        startInLoadingState={false}
        // 외부 앱 호출 (intent://, market://) 차단
        originWhitelist={['https://*', 'http://*']}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
});

export const AndroidMetaScraper = AndroidMetaScraperImpl;
