import { useState, useCallback, useRef } from 'react';
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
import { generateDeepLink, hasCoupangApiKeys } from '../../services/coupangApi';
import CoupangScraper, {
  ScrapedProduct,
} from '../../components/CoupangScraper';

function extractUrl(text: string): string {
  const coupangMatch = text.match(/https?:\/\/[^\s]*coupang\.com[^\s]*/i);
  if (coupangMatch) return coupangMatch[0];
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : text.trim();
}

/** URL에서 productId, vendorItemId 추출 */
function extractIds(url: string): { productId?: string; vendorItemId?: string } {
  const pidMatch = url.match(/\/products\/(\d+)/);
  const vidMatch = url.match(/[?&]vendorItemId=(\d+)/);
  return {
    productId: pidMatch?.[1],
    vendorItemId: vidMatch?.[1],
  };
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
  const [saving, setSaving] = useState(false);
  const isFromShare = !!sharedUrl;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrapeKeyRef = useRef(0);
  const parsedUrlRef = useRef('');
  const resolvedUrlRef = useRef('');
  const affiliateUrlRef = useRef('');

  // 모달이 다시 열릴 때 state 초기화 (expo-router 캐싱 대응)
  useFocusEffect(
    useCallback(() => {
      setUrl(sharedUrl ?? '');
      setTargetPrice('');
      setStep('url');
      setScraped(null);
      setScrapeFailed(false);
      setScrapeUrl(null);
      setSaving(false);
    }, [sharedUrl])
  );

  const suggestedPrice = scraped?.price ? Math.round(scraped.price * 0.9) : null;

  // 1단계: "다음" 버튼 → URL resolve + 딥링크 생성 → 스크래핑 시작
  const handleNext = async () => {
    const parsedUrl = extractUrl(url);
    if (!parsedUrl.includes('coupang.com')) {
      Alert.alert('지원하지 않는 링크', '현재 쿠팡 링크만 지원합니다.');
      return;
    }
    if (trackedItems.length >= 20) {
      Alert.alert('등록 제한', '상품은 최대 20개까지 등록할 수 있습니다.');
      return;
    }

    parsedUrlRef.current = parsedUrl;
    retryCountRef.current = 0;
    setStep('scraping');
    setScraped(null);
    setScrapeFailed(false);

    // URL resolve + 제휴 딥링크 생성 (WebView와 무관하게 선행)
    let resolved = parsedUrl;
    if (parsedUrl.includes('link.coupang.com')) {
      try {
        const res = await fetch(parsedUrl, { redirect: 'manual' });
        const location = res.headers.get('location');
        if (location && location.includes('coupang.com')) {
          resolved = location;
        } else {
          const res2 = await fetch(parsedUrl, { redirect: 'follow' });
          if (res2.url && res2.url.includes('coupang.com')) resolved = res2.url;
        }
      } catch {}
    }
    resolvedUrlRef.current = resolved;
    console.log('[AddItem] resolved:', resolved.slice(0, 80));

    // 제휴 딥링크 생성
    affiliateUrlRef.current = parsedUrl; // fallback
    if (hasCoupangApiKeys() && (resolved.includes('/vp/') || resolved.includes('/vm/'))) {
      try {
        const deepLink = await generateDeepLink(resolved);
        if (deepLink?.shortenUrl) {
          affiliateUrlRef.current = deepLink.shortenUrl;
          console.log('[AddItem] 제휴 링크:', deepLink.shortenUrl.slice(0, 60));
        }
      } catch {}
    }

    const isIos = Platform.OS === 'ios';
    const scrapeDelay = isIos ? 4000 : 0;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setScrapeUrl(null);
      // 첫 타임아웃 시 자동 재시도 1회
      if (retryCountRef.current === 0 && parsedUrlRef.current) {
        retryCountRef.current++;
        console.log('[AddItem] 타임아웃 → 자동 재시도');
        setTimeout(() => {
          scrapeKeyRef.current++;
          setScrapeUrl(parsedUrlRef.current);
          // 재시도 타임아웃
          timeoutRef.current = setTimeout(() => {
            setScrapeFailed(true);
            setScrapeUrl(null);
          }, 30000);
        }, 1000);
        return;
      }
      setScrapeFailed(true);
    }, 30000 + scrapeDelay);

    setTimeout(() => {
      scrapeKeyRef.current++;
      setScrapeUrl(parsedUrl);
    }, scrapeDelay);
  };

  // 스크래핑 성공 → 2단계 진입
  const handleScrapeResult = useCallback((data: ScrapedProduct) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setScraped(data);
    setScrapeUrl(null);
    setStep('target');
  }, []);

  const retryCountRef = useRef(0);

  const handleScrapeError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setScrapeUrl(null);

    // 첫 실패 시 자동 재시도 1회 (WebView 콜드 스타트 대응)
    if (retryCountRef.current === 0 && parsedUrlRef.current) {
      retryCountRef.current++;
      console.log('[AddItem] 첫 실패 → 자동 재시도');
      setTimeout(() => {
        scrapeKeyRef.current++;
        setScrapeUrl(parsedUrlRef.current);
      }, 1000);
      return;
    }
    setScrapeFailed(true);
  }, []);

  // 2단계: "저장" 버튼
  const handleSave = async () => {
    if (!targetPrice.trim()) return;
    setSaving(true);

    // 제휴 딥링크: handleNext에서 미리 생성 또는 scraped.resolvedUrl로 재시도
    const resolvedUrl = scraped?.resolvedUrl || resolvedUrlRef.current || parsedUrlRef.current;
    let affiliateUrl = affiliateUrlRef.current || parsedUrlRef.current;

    // handleNext에서 제휴 링크 생성 실패했으면 scraped.resolvedUrl로 재시도
    if (affiliateUrl === parsedUrlRef.current && hasCoupangApiKeys() &&
        (resolvedUrl.includes('/vp/') || resolvedUrl.includes('/vm/'))) {
      try {
        console.log('[AddItem] 딥링크 재시도:', resolvedUrl.slice(0, 60));
        const deepLink = await generateDeepLink(resolvedUrl);
        if (deepLink?.shortenUrl) {
          affiliateUrl = deepLink.shortenUrl;
          console.log('[AddItem] 제휴 링크 생성 성공:', affiliateUrl.slice(0, 60));
        }
      } catch {}
    }
    console.log('[AddItem] 저장 URL:', affiliateUrl.slice(0, 60));

    const nameFromText = parseProductName(sharedText || '');
    const productName = scraped?.title || nameFromText || '상품 정보 없음';
    const currentPrice = scraped?.price || 0;
    const thumbnail = scraped?.image || '';

    // URL에서 productId/vendorItemId 추출 (가격 매칭 정확도용)
    const ids = extractIds(resolvedUrl);

    addItem({
      id: Date.now().toString(),
      url: affiliateUrl,
      resolvedUrl,
      productId: ids.productId,
      vendorItemId: ids.vendorItemId,
      productName,
      currentPrice,
      targetPrice: Number(targetPrice),
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
    if (!targetPrice.trim()) {
      // 목표가 미입력 시 2단계로 이동 (scraped=null 상태)
      setScrapeFailed(false);
      setStep('target');
      return;
    }
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
    }, 20000);
    scrapeKeyRef.current++;
    setScrapeUrl(parsedUrlRef.current);
  };

  const goBack = () => {
    if (step === 'target' || step === 'scraping') {
      setScrapeUrl(null);
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
                    쿠팡 앱이 열리면 확인 후 돌아와주세요
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
              placeholder="목표가 (원)"
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

            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={goBack}>
                <Text style={styles.cancelText}>뒤로</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!targetPrice.trim() || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!targetPrice.trim() || saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.saveText}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <CoupangScraper
        key={scrapeKeyRef.current}
        url={scrapeUrl}
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
