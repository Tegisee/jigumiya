import { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView, {
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview';

export interface ScrapedProduct {
  title: string;
  price: number;
  image: string;
}

interface Props {
  url: string | null;
  onResult: (data: ScrapedProduct) => void;
  onError: () => void;
}

// 페이지 로드 전 coupang:// 딥링크 차단 — window.location 세터 오버라이드
const BLOCK_DEEPLINK_JS = `
(function() {
  var origLocation = window.location;
  var _href = origLocation.href;
  try {
    Object.defineProperty(window.__proto__, 'location', {
      configurable: true,
      get: function() { return origLocation; },
      set: function(v) {
        if (typeof v === 'string' && (v.startsWith('coupang://') || v.startsWith('itms-appss://') || v.startsWith('intent://'))) {
          return;
        }
        origLocation.href = v;
      }
    });
  } catch(e) {}
})();
true;
`;

// DOM에서 상품 정보 추출하는 JS
const SCRAPE_JS = `
(function() {
  try {
    var title = '';
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) title = ogTitle.getAttribute('content') || '';
    if (!title) {
      var h2 = document.querySelector('h2.prod-buy-header__title, h1.prod-buy-header__title, .prod-buy-header__title');
      if (h2) title = h2.textContent.trim();
    }
    if (!title) {
      var metaTitle = document.querySelector('title');
      if (metaTitle) title = metaTitle.textContent.trim();
    }

    var price = 0;
    var totalPrice = document.querySelector('.total-price strong');
    if (totalPrice) {
      price = parseInt(totalPrice.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    }
    if (!price) {
      var salePrice = document.querySelector('.prod-sale-price .total-price');
      if (salePrice) {
        price = parseInt(salePrice.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      }
    }
    if (!price) {
      var ogPrice = document.querySelector('meta[property="product:price:amount"]');
      if (ogPrice) price = parseInt((ogPrice.getAttribute('content') || '').replace(/[^0-9]/g, ''), 10) || 0;
    }
    if (!price) {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var ld = JSON.parse(scripts[i].textContent);
          if (ld.offers && ld.offers.price) {
            price = parseInt(String(ld.offers.price).replace(/[^0-9]/g, ''), 10) || 0;
            if (price) break;
          }
        } catch(e) {}
      }
    }

    var image = '';
    var ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) image = ogImage.getAttribute('content') || '';
    if (!image) {
      var mainImg = document.querySelector('.prod-image__detail img, .prod-image img');
      if (mainImg) image = mainImg.getAttribute('src') || '';
    }
    // 프로토콜 없는 URL 보정 (//xxx → https://xxx)
    if (image && image.startsWith('//')) image = 'https:' + image;

    // " | 쿠팡" 접미사 제거
    title = title.replace(/\s*[|\-].*$/, '').trim();

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'SCRAPED',
      url: window.location.href,
      title: title,
      price: price,
      image: image
    }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'ERROR',
      message: e.message
    }));
  }
})();
true;
`;

export default function CoupangScraper({ url, onResult, onError }: Props) {
  const webViewRef = useRef<WebView>(null);
  const doneRef = useRef(false);
  const injectedRef = useRef(false);

  // url이 바뀌면 상태 리셋
  const prevUrlRef = useRef(url);
  if (url !== prevUrlRef.current) {
    prevUrlRef.current = url;
    doneRef.current = false;
    injectedRef.current = false;
  }

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (doneRef.current) return;
      try {
        const data = JSON.parse(event.nativeEvent.data);
        console.log('[Scraper] 메시지 수신 — URL:', data.url?.slice(0, 60), '제목:', data.title?.slice(0, 30), '가격:', data.price);
        if (data.type === 'SCRAPED' && data.price > 0) {
          doneRef.current = true;
          onResult({
            title: data.title || '',
            price: data.price || 0,
            image: data.image || '',
          });
        } else if (data.type === 'SCRAPED' && data.price === 0) {
          // 아직 상품 페이지가 아님 → 다음 로드에서 재시도 허용
          injectedRef.current = false;
        } else if (data.type === 'ERROR') {
          doneRef.current = true;
          onError();
        }
      } catch {
        // 파싱 실패 무시
      }
    },
    [onResult, onError]
  );

  const tryInject = useCallback(() => {
    if (doneRef.current || injectedRef.current) return;
    injectedRef.current = true;
    setTimeout(() => {
      if (!doneRef.current && webViewRef.current) {
        console.log('[Scraper] JS 인젝션 실행');
        webViewRef.current.injectJavaScript(SCRAPE_JS);
      }
    }, 2000);
  }, []);

  const handleNavigationChange = useCallback(
    (navState: WebViewNavigation) => {
      if (doneRef.current) return;

      const navUrl = navState.url || '';
      console.log('[Scraper] 네비게이션:', navUrl.slice(0, 80), 'loading:', navState.loading);

      const isProductPage =
        navUrl.includes('coupang.com/vp/products/') ||
        navUrl.includes('coupang.com/vm/products/');

      if (isProductPage && !navState.loading) {
        tryInject();
      }
    },
    [tryInject]
  );

  const handleLoadEnd = useCallback(() => {
    if (doneRef.current || injectedRef.current) return;
    // onLoadEnd 시점에 현재 URL 확인 불가 → 무조건 인젝션 시도 (price=0이면 무시됨)
    console.log('[Scraper] onLoadEnd — 인젝션 시도');
    tryInject();
  }, [tryInject]);


  const handleError = useCallback(() => {
    if (!doneRef.current) {
      doneRef.current = true;
      onError();
    }
  }, [onError]);

  if (!url) return null;

  return (
    <View style={styles.hidden}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationChange}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleError}
        originWhitelist={['https://*', 'http://*']}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={BLOCK_DEEPLINK_JS}
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
});
