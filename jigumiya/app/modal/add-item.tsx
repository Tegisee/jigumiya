import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { MAX_TRACKED_ITEMS } from '../../services/config';
import {
  generateDeepLink,
  hasCoupangApiKeys,
  extractProductId,
  extractVendorItemId,
} from '../../services/coupangApi';
import {
  callResolveAffiliate,
  warmupResolveAffiliate,
} from '../../services/firebase';
import CoupangScraper, {
  ScrapedProduct,
} from '../../components/CoupangScraper';

function extractUrl(text: string): string {
  const coupangMatch = text.match(/https?:\/\/[^\s]*coupang\.com[^\s]*/i);
  if (coupangMatch) return coupangMatch[0];
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : text.trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms),
    ),
  ]);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Coupang 단축 링크(link.coupang.com/a/...)는 3xx가 아니라
 * `redirectWebUrl = '...\\x3D...';` 형태의 JS 코드를 담은 200 HTML을 반환한다.
 * hex escape(\\xNN)를 디코드해 실제 vp URL을 추출 — Functions resolver 실패 시
 * 클라이언트 fallback에서 동일 로직으로 vp URL 확보 (functions/src/index.ts 미러).
 */
function extractRedirectUrlFromHtml(html: string): string | null {
  const match = html.match(
    /redirectWebUrl\s*=\s*['"]((?:\\x[0-9a-fA-F]{2}|[^'"\\])+)['"]/,
  );
  if (!match) return null;
  const decoded = match[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return decoded.includes('coupang.com') ? decoded : null;
}

/**
 * URL 후보 여러 개에서 productId/vendorItemId 추출 (먼저 잡히는 값 채택).
 * 단축 URL(link.coupang.com)이 resolve 실패해 남은 경우라도 affiliate/원본 URL에서 잡힐 수 있어
 * 후보 다중 시도가 하트 버튼(productId 의존)의 누락을 줄여줌.
 */
function extractIds(
  ...urls: (string | undefined | null)[]
): { productId?: string; vendorItemId?: string } {
  let productId: string | undefined;
  let vendorItemId: string | undefined;
  for (const u of urls) {
    if (!u) continue;
    if (!productId) {
      const pid = extractProductId(u);
      if (pid) productId = pid;
    }
    if (!vendorItemId) {
      const vid = extractVendorItemId(u);
      if (vid) vendorItemId = vid;
    }
    if (productId && vendorItemId) break;
  }
  return { productId, vendorItemId };
}

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

type Step = 'url' | 'scraping' | 'target';

export default function AddItemModal() {
  const router = useRouter();
  const { sharedUrl, sharedText } = useLocalSearchParams<{
    sharedUrl?: string;
    sharedText?: string;
  }>();
  const { addItem, trackedItems } = useAppStore();

  const [url, setUrl] = useState(sharedUrl ?? '');
  const [targetPrice, setTargetPrice] = useState('');
  const [step, setStep] = useState<Step>('url');
  const [scraped, setScraped] = useState<ScrapedProduct | null>(null);
  const [scrapeFailed, setScrapeFailed] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState<string | null>(null);
  const [scrapeHtml, setScrapeHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isFromShare = !!sharedUrl;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrapeKeyRef = useRef(0);
  const parsedUrlRef = useRef('');
  const resolvedUrlRef = useRef('');
  const affiliateUrlRef = useRef('');
  // 'url' 외 단계 진행 중에 쿠팡 앱 갔다 돌아올 때 useFocusEffect가 state를 리셋하지 않도록
  // 최신 step을 ref로 추적 (stale closure 회피)
  const stepRef = useRef<Step>('url');
  stepRef.current = step;

  // 모달 mount 시 Functions 워밍업 — 사용자가 URL 확인 + "다음" 누르는 1~2s 동안 컨테이너 init.
  // _layout.tsx launch 워밍업이 idle timeout/늦은 진입 케이스를 못 잡을 때 보강.
  useEffect(() => {
    warmupResolveAffiliate();
  }, []);

  // 모달이 다시 열릴 때 state 초기화 (expo-router 캐싱 대응).
  // 단, scraping/target 진행 중에는 보존 — 쿠팡 앱 이탈 후 복귀 시 처음부터 다시 시작 방지.
  useFocusEffect(
    useCallback(() => {
      if (stepRef.current !== 'url') return;
      setUrl(sharedUrl ?? '');
      setTargetPrice('');
      setStep('url');
      setScraped(null);
      setScrapeFailed(false);
      setScrapeUrl(null);
      setScrapeHtml(null);
      setSaving(false);
    }, [sharedUrl])
  );

  const suggestedPrice = scraped?.price ? Math.round(scraped.price * 0.9) : null;

  // 1단계: "다음" 버튼 → 사전 검증 + iOS 공유 시 가이드 Alert → proceedFromUrl
  const handleNext = async () => {
    const parsedUrl = extractUrl(url);
    if (!parsedUrl.includes('coupang.com')) {
      Alert.alert('지원하지 않는 링크', '현재 쿠팡 링크만 지원합니다.');
      return;
    }
    if (trackedItems.length >= MAX_TRACKED_ITEMS) {
      Alert.alert(
        '가격 추적 한도',
        `가격 추적은 최대 ${MAX_TRACKED_ITEMS}개까지 할 수 있어요.\n기존 상품을 삭제한 후 다시 시도해주세요.`,
      );
      return;
    }

    // iOS + 공유 진입: 쿠팡 앱 잠시 열릴 가능성 안내 (Universal Link 우회 실패 케이스 대비)
    if (Platform.OS === 'ios' && isFromShare) {
      Alert.alert(
        '쿠팡 앱이 잠깐 열릴 수 있어요',
        '확인 후 지금이야 앱으로 돌아와주세요',
        [
          { text: '취소', style: 'cancel' },
          { text: '확인', onPress: () => proceedFromUrl(parsedUrl) },
        ],
      );
      return;
    }

    proceedFromUrl(parsedUrl);
  };

  // 1단계 본 처리 — URL resolve + 딥링크 생성 → 스크래핑 시작
  const proceedFromUrl = async (parsedUrl: string) => {
    parsedUrlRef.current = parsedUrl;
    retryCountRef.current = 0;
    setStep('scraping');
    setScraped(null);
    setScrapeFailed(false);

    // URL resolve + 제휴 딥링크 생성 (Functions 우선 → 실패 시 클라이언트 fallback)
    let resolved = parsedUrl;
    let affiliate = parsedUrl;

    const t0 = Date.now();
    // 8s timeout — 내부 1.5s auth 대기 + Functions 응답. 5s는 너무 빡빡해서 8s로 복원.
    const functionsResult = await withTimeout(
      callResolveAffiliate(parsedUrl),
      8000,
      'resolveAffiliate',
    ).catch((e) => {
      console.warn('[AddItem] callResolveAffiliate timeout/error:', e);
      return { ok: false as const, error: 'timeout', detail: String(e) };
    });
    console.log(
      `[AddItem] Functions resolve ${Date.now() - t0}ms ok=${functionsResult.ok}`,
    );
    if (functionsResult.ok) {
      resolved = functionsResult.originalUrl;
      affiliate = functionsResult.shortenUrl;
      console.log('[AddItem] Functions 성공:', affiliate.slice(0, 60));
    } else {
      console.warn('[AddItem] Functions 실패 → client fallback:', functionsResult.error, functionsResult.detail);
      // link.coupang.com 단축 URL: Coupang은 3xx가 아니라 200 + JS hex-escape redirectWebUrl로 응답.
      // (1) 30x Location 헤더 시도 → (2) HTML body에서 redirectWebUrl 파싱 → (3) redirect:'follow' 시도.
      if (parsedUrl.includes('link.coupang.com')) {
        try {
          const res = await fetchWithTimeout(parsedUrl, { redirect: 'manual' }, 5000);
          const location = res.headers.get('location');
          if (location && location.includes('coupang.com')) {
            resolved = location;
            console.log('[AddItem] fallback Location:', resolved.slice(0, 80));
          } else if (res.status === 200) {
            const html = await res.text();
            const extracted = extractRedirectUrlFromHtml(html);
            if (extracted) {
              resolved = extracted;
              console.log('[AddItem] fallback redirectWebUrl 파싱:', resolved.slice(0, 80));
            }
          }
          if (resolved === parsedUrl) {
            const res2 = await fetchWithTimeout(parsedUrl, { redirect: 'follow' }, 5000);
            if (res2.url && res2.url.includes('coupang.com') && res2.url !== parsedUrl) {
              resolved = res2.url;
              console.log('[AddItem] fallback follow url:', resolved.slice(0, 80));
            } else if (res2.status === 200) {
              const html2 = await res2.text();
              const extracted2 = extractRedirectUrlFromHtml(html2);
              if (extracted2) {
                resolved = extracted2;
                console.log('[AddItem] fallback follow redirectWebUrl:', resolved.slice(0, 80));
              }
            }
          }
        } catch (e) {
          console.warn('[AddItem] fallback resolve 실패:', e);
        }
      }
      if (hasCoupangApiKeys() && resolved.includes('coupang.com') && resolved !== parsedUrl) {
        try {
          const deepLink = await withTimeout(
            generateDeepLink(resolved),
            5000,
            'deeplink',
          );
          if (deepLink?.shortenUrl) {
            affiliate = deepLink.shortenUrl;
            console.log('[AddItem] client 제휴 링크:', deepLink.shortenUrl.slice(0, 60));
          }
        } catch {}
      }
    }

    resolvedUrlRef.current = resolved;
    affiliateUrlRef.current = affiliate;
    console.log('[AddItem] resolved:', resolved.slice(0, 80));

    // iOS: fetch로 HTML 미리 받아서 WebView에 문자열로 로드 (Universal Link/딥링크 튕김 원천 차단)
    // Android: resolved URL을 WebView에 직접 로드
    const scrapeTarget = resolved.includes('coupang.com/vp/') || resolved.includes('coupang.com/vm/')
      ? resolved : parsedUrl;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setScrapeUrl(null);
      setScrapeHtml(null);
      // 첫 타임아웃 시 자동 재시도 1회
      if (retryCountRef.current === 0 && parsedUrlRef.current) {
        retryCountRef.current++;
        console.log('[AddItem] 타임아웃 → 자동 재시도');
        setTimeout(() => {
          scrapeKeyRef.current++;
          startScrape(scrapeTarget);
        }, 1000);
        return;
      }
      setScrapeFailed(true);
    }, 30000);

    scrapeKeyRef.current++;
    startScrape(scrapeTarget);
  };

  /** iOS: HTML fetch (8s timeout) → html prop, Android: URL 직접 로드 */
  const startScrape = async (targetUrl: string) => {
    if (Platform.OS === 'ios') {
      try {
        console.log('[AddItem] iOS: HTML fetch 시작 →', targetUrl.slice(0, 80));
        const res = await fetchWithTimeout(
          targetUrl,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
              'Accept':
                'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ko-KR,ko;q=0.9',
            },
            redirect: 'follow',
          },
          8000,
        );
        if (res.ok) {
          const html = await res.text();
          console.log('[AddItem] iOS: HTML fetch 성공, length=', html.length);
          setScrapeHtml(html);
          setScrapeUrl(null);
          return;
        }
      } catch (e) {
        console.warn('[AddItem] iOS: HTML fetch timeout/실패, URL 폴백 →', e);
      }
    }
    // Android 또는 iOS fetch 실패/타임아웃 시 URL 직접 로드
    setScrapeHtml(null);
    setScrapeUrl(targetUrl);
  };

  // 스크래핑 성공 → 2단계 진입
  const handleScrapeResult = useCallback((data: ScrapedProduct) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setScraped(data);
    setScrapeUrl(null);
    setScrapeHtml(null);
    setStep('target');
  }, []);

  const retryCountRef = useRef(0);

  const handleScrapeError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setScrapeUrl(null);
    setScrapeHtml(null);

    // 첫 실패 시 자동 재시도 1회 (WebView 콜드 스타트 대응)
    if (retryCountRef.current === 0 && resolvedUrlRef.current) {
      retryCountRef.current++;
      console.log('[AddItem] 첫 실패 → 자동 재시도');
      const target = resolvedUrlRef.current.includes('coupang.com/vp/') || resolvedUrlRef.current.includes('coupang.com/vm/')
        ? resolvedUrlRef.current : parsedUrlRef.current;
      setTimeout(() => {
        scrapeKeyRef.current++;
        startScrape(target);
      }, 1000);
      return;
    }
    setScrapeFailed(true);
  }, []);

  // 2단계: "저장" 버튼
  const handleSave = async () => {
    setSaving(true);

    // 제휴 딥링크: handleNext에서 미리 생성 또는 scraped.resolvedUrl로 재시도
    const resolvedUrl = scraped?.resolvedUrl || resolvedUrlRef.current || parsedUrlRef.current;
    let affiliateUrl = affiliateUrlRef.current || parsedUrlRef.current;

    // handleNext에서 제휴 링크 생성 실패했으면 scraped.resolvedUrl로 재시도 (Functions → client fallback)
    if (affiliateUrl === parsedUrlRef.current && resolvedUrl.includes('coupang.com')) {
      console.log('[AddItem] Functions 재시도:', resolvedUrl.slice(0, 60));
      const retryResult = await withTimeout(
        callResolveAffiliate(resolvedUrl),
        8000,
        'resolveAffiliate-retry',
      ).catch((e) => {
        console.warn('[AddItem] callResolveAffiliate 재시도 timeout/error:', e);
        return { ok: false as const, error: 'timeout', detail: String(e) };
      });
      if (retryResult.ok) {
        affiliateUrl = retryResult.shortenUrl;
        console.log('[AddItem] Functions 재시도 성공:', affiliateUrl.slice(0, 60));
      } else if (hasCoupangApiKeys()) {
        try {
          console.log('[AddItem] client 딥링크 재시도:', resolvedUrl.slice(0, 60));
          const deepLink = await withTimeout(
            generateDeepLink(resolvedUrl),
            5000,
            'deeplink-retry',
          );
          if (deepLink?.shortenUrl) {
            affiliateUrl = deepLink.shortenUrl;
            console.log('[AddItem] client 제휴 링크 성공:', affiliateUrl.slice(0, 60));
          }
        } catch {}
      }
    }
    console.log('[AddItem] 저장 URL:', affiliateUrl.slice(0, 60));

    const nameFromText = parseProductName(sharedText || '');
    const productName = scraped?.title || nameFromText || '상품 정보 없음';
    const currentPrice = scraped?.price || 0;
    const thumbnail = scraped?.image || '';

    // URL에서 productId/vendorItemId 추출 (다중 후보 시도 — 하트 버튼 누락 방지)
    const ids = extractIds(
      scraped?.resolvedUrl,
      resolvedUrl,
      affiliateUrl,
      parsedUrlRef.current,
    );

    addItem({
      id: Date.now().toString(),
      url: affiliateUrl,
      resolvedUrl,
      productId: ids.productId,
      vendorItemId: ids.vendorItemId,
      productName,
      currentPrice,
      targetPrice: targetPrice.trim() ? Number(targetPrice) : undefined,
      thumbnail,
      priceHistory: currentPrice
        ? [{ date: new Date().toISOString().slice(0, 10), price: currentPrice }]
        : [],
      createdAt: Date.now(),
    });

    setSaving(false);
    if (isFromShare) {
      router.replace('/');
    } else {
      router.back();
    }
  };

  // 스크래핑 실패 → 정보 없이 저장
  const handleSaveWithoutScrape = () => {
    setScraped(null);
    setScrapeFailed(false);
    setStep('target');
  };

  const handleRetry = () => {
    setScrapeFailed(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setScrapeFailed(true);
      setScrapeUrl(null);
      setScrapeHtml(null);
    }, 20000);
    const target = resolvedUrlRef.current.includes('coupang.com/vp/') || resolvedUrlRef.current.includes('coupang.com/vm/')
      ? resolvedUrlRef.current : parsedUrlRef.current;
    scrapeKeyRef.current++;
    startScrape(target);
  };

  const goBack = () => {
    if (step === 'target' || step === 'scraping') {
      setScrapeUrl(null);
      setScrapeHtml(null);
      setScraped(null);
      setScrapeFailed(false);
      setStep('url');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
      isFromShare ? router.replace('/') : router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.title}>상품 추가</Text>

        {/* ── 1단계: URL 입력 ── */}
        {step === 'url' && (
          <>
            <View>
              {isFromShare && <Text style={styles.shareLabel}>공유된 링크</Text>}
              <TextInput
                style={[styles.input, isFromShare && styles.inputReadOnly]}
                placeholder="상품 URL 붙여넣기"
                placeholderTextColor={theme.subtext}
                value={url}
                onChangeText={isFromShare ? undefined : (text: string) => {
                  if (text.includes('https://') && text.length > 30 && text !== url) {
                    const extracted = extractUrl(text);
                    if (extracted.startsWith('https://')) { setUrl(extracted); return; }
                  }
                  setUrl(text);
                }}
                editable={!isFromShare}
                autoCapitalize="none"
                keyboardType="url"
                numberOfLines={1}
              />
            </View>
            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={goBack}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !url.trim() && styles.saveBtnDisabled]}
                onPress={handleNext}
                disabled={!url.trim()}
                activeOpacity={0.8}
              >
                <Text style={styles.saveText}>다음</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── 스크래핑 중 ── */}
        {step === 'scraping' && (
          <View style={styles.scrapingBox}>
            {!scrapeFailed ? (
              <>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={styles.scrapingText}>상품 정보를 가져오는 중...</Text>
                {Platform.OS === 'ios' && (
                  <Text style={styles.iosHintText}>
                    쿠팡 앱이 열리면 지금이야 앱으로 돌아와서 계속해주세요.
                  </Text>
                )}
              </>
            ) : (
              <>
                <Ionicons name="alert-circle-outline" size={40} color="#FF6666" />
                <Text style={styles.failedText}>상품 정보를 가져오지 못했습니다</Text>
                <View style={styles.failedButtons}>
                  <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
                    <Text style={styles.retryBtnText}>다시 시도</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.skipBtn} onPress={handleSaveWithoutScrape} activeOpacity={0.8}>
                    <Text style={styles.skipBtnText}>정보 없이 진행</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={goBack} style={styles.backLink}>
                  <Text style={styles.backLinkText}>← URL 다시 입력</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── 2단계: 현재가 표시 + 목표가 입력 ── */}
        {step === 'target' && (
          <>
            {scraped && (
              <View style={styles.previewCard}>
                <Text style={styles.previewName} numberOfLines={2}>{scraped.title}</Text>
                <Text style={styles.previewPrice}>
                  현재가 {scraped.price.toLocaleString()}원
                </Text>
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="목표가 입력 (선택사항)"
              placeholderTextColor={theme.subtext}
              value={targetPrice}
              onChangeText={setTargetPrice}
              keyboardType="number-pad"
              autoFocus
            />

            {suggestedPrice && !targetPrice && (
              <TouchableOpacity
                style={styles.suggestBtn}
                onPress={() => setTargetPrice(String(suggestedPrice))}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestText}>
                  추천 목표가: {suggestedPrice.toLocaleString()}원 (10% 할인)
                </Text>
              </TouchableOpacity>
            )}

            {!targetPrice.trim() && (
              <Text style={styles.skipHint}>
                건너뛰면 최저가 갱신 시 알림을 보내드려요
              </Text>
            )}

            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={goBack}>
                <Text style={styles.cancelText}>뒤로</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.saveText}>{targetPrice.trim() ? '저장' : '건너뛰고 저장'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <CoupangScraper
        key={scrapeKeyRef.current}
        url={scrapeUrl}
        html={scrapeHtml}
        baseUrl="https://www.coupang.com"
        onResult={handleScrapeResult}
        onError={handleScrapeError}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  inner: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 30,
    textAlign: 'center',
  },
  shareLabel: {
    fontSize: 12,
    color: theme.primary,
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.text,
    marginBottom: 16,
  },
  inputReadOnly: {
    opacity: 0.7,
    backgroundColor: '#111111',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  cancelText: {
    color: theme.subtext,
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: 'center',
  },
  saveText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },

  // 스크래핑 중
  scrapingBox: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 40,
  },
  scrapingText: {
    color: theme.subtext,
    fontSize: 15,
  },
  iosHintText: {
    color: theme.primary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  // 실패
  failedText: {
    color: '#FF6666',
    fontSize: 15,
    fontWeight: '600',
  },
  failedButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 8,
  },
  retryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.primary,
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  skipBtnText: {
    color: theme.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  backLink: {
    marginTop: 8,
    padding: 8,
  },
  backLinkText: {
    color: theme.subtext,
    fontSize: 13,
  },

  // 2단계: 현재가 카드
  previewCard: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 6,
  },
  previewName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  previewPrice: {
    color: theme.primary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  skipHint: {
    color: theme.subtext,
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  suggestBtn: {
    marginTop: -10,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  suggestText: {
    color: theme.primary,
    fontSize: 13,
  },
});
