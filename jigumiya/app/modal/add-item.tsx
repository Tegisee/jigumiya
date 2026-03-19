import { useState, useCallback, useRef, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { generateDeepLink, hasCoupangApiKeys } from '../../services/coupangApi';
import CoupangScraper, {
  ScrapedProduct,
} from '../../components/CoupangScraper';

/** 텍스트에서 쿠팡 URL만 추출 */
function extractUrl(text: string): string {
  const coupangMatch = text.match(/https?:\/\/[^\s]*coupang\.com[^\s]*/i);
  if (coupangMatch) return coupangMatch[0];
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : text.trim();
}

/** 공유 텍스트에서 상품명 추출 */
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

export default function AddItemModal() {
  const router = useRouter();
  const { sharedUrl, sharedText } = useLocalSearchParams<{
    sharedUrl?: string;
    sharedText?: string;
  }>();
  const { addItem, trackedItems } = useAppStore();

  const [url, setUrl] = useState(sharedUrl ?? '');
  const [targetPrice, setTargetPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [scrapeFailed, setScrapeFailed] = useState(false);
  const isFromShare = !!sharedUrl;
  const pendingRef = useRef<{ url: string; targetPrice: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 단일 스크래퍼: 미리보기 + 저장 겸용
  const [scrapeUrl, setScrapeUrl] = useState<string | null>(null);
  const scrapeKeyRef = useRef(0);
  const [preview, setPreview] = useState<ScrapedProduct | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const modeRef = useRef<'preview' | 'save'>('preview');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 추천 목표가 (현재가의 90%)
  const suggestedPrice = preview?.price ? Math.round(preview.price * 0.9) : null;

  // Share Intent 진입 시 즉시 미리보기 스크래핑
  useEffect(() => {
    if (isFromShare && sharedUrl) {
      const parsedUrl = extractUrl(sharedUrl);
      if (parsedUrl.includes('coupang.com')) {
        startPreview(parsedUrl);
      }
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const startPreview = (rawUrl: string) => {
    modeRef.current = 'preview';
    setPreviewLoading(true);
    setPreview(null);
    scrapeKeyRef.current++;
    setScrapeUrl(rawUrl);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setPreviewLoading(false);
      setScrapeUrl(null);
    }, 20000);
  };

  // 수동 입력: URL 변경 시 디바운스로 미리보기 (1.5초 대기)
  const handleUrlChange = (text: string) => {
    setUrl(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const parsedUrl = extractUrl(text);
      if (parsedUrl.includes('coupang.com') && parsedUrl.length > 25) {
        startPreview(parsedUrl);
      }
    }, 1500);
  };

  const handleApplySuggestion = () => {
    if (suggestedPrice) {
      setTargetPrice(String(suggestedPrice));
    }
  };

  // 스크래퍼 결과 핸들러 (preview / save 모드 분기)
  const handleScrapeResult = useCallback(
    (data: ScrapedProduct) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (modeRef.current === 'preview') {
        setPreview(data);
        setPreviewLoading(false);
        setScrapeUrl(null);
      } else {
        // save 모드: 바로 저장
        doSave(data);
      }
    },
    [],
  );

  const handleScrapeError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (modeRef.current === 'preview') {
      setPreviewLoading(false);
      setScrapeUrl(null);
    } else {
      setLoading(false);
      setScrapeUrl(null);
      setScrapeFailed(true);
    }
  }, []);

  const doSave = async (scraped: ScrapedProduct | null) => {
    if (!pendingRef.current) return;
    const { url: itemUrl, targetPrice: tp } = pendingRef.current;
    pendingRef.current = null;

    let affiliateUrl = itemUrl;
    if (hasCoupangApiKeys()) {
      try {
        const deepLink = await generateDeepLink(itemUrl);
        if (deepLink?.shortenUrl) affiliateUrl = deepLink.shortenUrl;
      } catch {}
    }

    const nameFromText = parseProductName(sharedText || '');
    const productName = scraped?.title || nameFromText || '상품 정보 없음';
    const currentPrice = scraped?.price || 0;
    const thumbnail = scraped?.image || '';

    addItem({
      id: Date.now().toString(),
      url: affiliateUrl,
      resolvedUrl: scraped?.resolvedUrl || '',
      productName,
      currentPrice,
      targetPrice: tp,
      thumbnail,
      priceHistory: currentPrice
        ? [{ date: new Date().toISOString().slice(0, 10), price: currentPrice }]
        : [],
      createdAt: Date.now(),
    });

    setLoading(false);
    setScrapeUrl(null);
    if (isFromShare) {
      router.replace('/');
    } else {
      router.back();
    }
  };

  const handleSave = () => {
    if (!url.trim() || !targetPrice.trim()) return;

    const parsedUrl = extractUrl(url);

    if (!parsedUrl.includes('coupang.com')) {
      Alert.alert('지원하지 않는 링크', '현재 쿠팡 링크만 지원합니다.');
      return;
    }

    if (trackedItems.length >= 20) {
      Alert.alert('등록 제한', '상품은 최대 20개까지 등록할 수 있습니다.');
      return;
    }

    pendingRef.current = {
      url: parsedUrl,
      targetPrice: Number(targetPrice),
    };

    // 미리보기 데이터가 있으면 재스크래핑 없이 바로 저장
    if (preview) {
      doSave(preview);
      return;
    }

    // 미리보기 없으면 save 모드로 스크래핑
    modeRef.current = 'save';
    setLoading(true);
    setScrapeFailed(false);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (pendingRef.current) {
        setLoading(false);
        setScrapeUrl(null);
        setScrapeFailed(true);
        pendingRef.current = null;
      }
    }, 20000);

    scrapeKeyRef.current++;
    setScrapeUrl(parsedUrl);
  };

  const handleRetry = () => {
    const parsedUrl = extractUrl(url);
    modeRef.current = 'save';
    setLoading(true);
    setScrapeFailed(false);
    pendingRef.current = {
      url: parsedUrl,
      targetPrice: Number(targetPrice),
    };

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (pendingRef.current) {
        setLoading(false);
        setScrapeUrl(null);
        setScrapeFailed(true);
        pendingRef.current = null;
      }
    }, 20000);

    scrapeKeyRef.current++;
    setScrapeUrl(parsedUrl);
  };

  const handleSaveWithoutScrape = () => {
    pendingRef.current = {
      url: extractUrl(url),
      targetPrice: Number(targetPrice),
    };
    setScrapeFailed(false);
    doSave(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.title}>상품 추가</Text>

        <View>
          {isFromShare && (
            <Text style={styles.shareLabel}>공유된 링크</Text>
          )}
          <TextInput
            style={[styles.input, isFromShare && styles.inputReadOnly]}
            placeholder="상품 URL 붙여넣기"
            placeholderTextColor={theme.subtext}
            value={url}
            onChangeText={isFromShare ? undefined : handleUrlChange}
            editable={!isFromShare}
            autoCapitalize="none"
            keyboardType="url"
            numberOfLines={1}
          />
        </View>

        {/* 현재가 미리보기 */}
        {previewLoading && (
          <View style={styles.previewBox}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.previewLoadingText}>현재가 확인 중...</Text>
          </View>
        )}
        {preview && !previewLoading && (
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {preview.title}
            </Text>
            <Text style={styles.previewPrice}>
              현재가 {preview.price.toLocaleString()}원
            </Text>
          </View>
        )}

        {/* 목표가 입력 + 추천 */}
        <View>
          <TextInput
            style={styles.input}
            placeholder="목표가 (원)"
            placeholderTextColor={theme.subtext}
            value={targetPrice}
            onChangeText={setTargetPrice}
            keyboardType="number-pad"
          />
          {suggestedPrice && !targetPrice && (
            <TouchableOpacity
              style={styles.suggestBtn}
              onPress={handleApplySuggestion}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestText}>
                추천 목표가: {suggestedPrice.toLocaleString()}원 (10% 할인)
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {scrapeFailed && (
          <View style={styles.failedBox}>
            <Text style={styles.failedText}>
              상품 정보를 가져오지 못했습니다
            </Text>
            <View style={styles.failedButtons}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={handleRetry}
                activeOpacity={0.8}
              >
                <Text style={styles.retryBtnText}>다시 시도</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleSaveWithoutScrape}
                activeOpacity={0.8}
              >
                <Text style={styles.skipBtnText}>정보 없이 저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => isFromShare ? router.replace('/') : router.back()}
          >
            <Text style={styles.cancelText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (loading || scrapeFailed) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={loading || scrapeFailed}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.saveText}>저장</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 단일 Hidden WebView — 미리보기 + 저장 겸용 */}
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
  previewBox: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewLoadingText: {
    color: theme.subtext,
    fontSize: 14,
  },
  previewTitle: {
    color: theme.subtext,
    fontSize: 13,
    flex: 1,
  },
  previewPrice: {
    color: theme.primary,
    fontSize: 16,
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
  failedBox: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    gap: 12,
  },
  failedText: {
    color: '#FF6666',
    fontSize: 14,
    fontWeight: '600',
  },
  failedButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  retryBtn: {
    flex: 1,
    paddingVertical: 10,
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
    paddingVertical: 10,
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
});
