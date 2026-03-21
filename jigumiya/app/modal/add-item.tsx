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
  const [scrapeUrl, setScrapeUrl] = useState<string | null>(null);
  const isFromShare = !!sharedUrl;
  const pendingRef = useRef<{ url: string; targetPrice: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrapeKeyRef = useRef(0);

  const saveItem = useCallback(
    async (scraped: ScrapedProduct | null) => {
      if (!pendingRef.current) return;
      const { url: itemUrl, targetPrice: tp } = pendingRef.current;
      pendingRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // 파트너스 딥링크 변환 (API 키 있을 때만)
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
      // Share Intent 경로: back()하면 쿠팡으로 복귀 → 명시적 홈 이동
      if (isFromShare) {
        router.replace('/');
      } else {
        router.back();
      }
    },
    [addItem, router, sharedText, isFromShare],
  );

  const handleScrapeResult = useCallback(
    (data: ScrapedProduct) => {
      saveItem(data);
    },
    [saveItem],
  );

  const handleScrapeError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(false);
    setScrapeUrl(null);
    setScrapeFailed(true);
  }, []);

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

    setLoading(true);
    setScrapeFailed(false);
    pendingRef.current = {
      url: parsedUrl,
      targetPrice: Number(targetPrice),
    };

    // 20초 타임아웃
    timeoutRef.current = setTimeout(() => {
      if (pendingRef.current) {
        setLoading(false);
        setScrapeUrl(null);
        setScrapeFailed(true);
        pendingRef.current = null;
      }
    }, 20000);

    // WebView 스크래핑 시작
    scrapeKeyRef.current++;
    setScrapeUrl(parsedUrl);
  };

  const handleRetry = () => {
    const parsedUrl = extractUrl(url);
    setLoading(true);
    setScrapeFailed(false);
    pendingRef.current = {
      url: parsedUrl,
      targetPrice: Number(targetPrice),
    };

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
    saveItem(null);
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
            onChangeText={isFromShare ? undefined : setUrl}
            editable={!isFromShare}
            autoCapitalize="none"
            keyboardType="url"
            numberOfLines={1}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="목표가 (원)"
          placeholderTextColor={theme.subtext}
          value={targetPrice}
          onChangeText={setTargetPrice}
          keyboardType="number-pad"
        />

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

      {/* Hidden WebView — 저장 버튼 누를 때만 스크래핑 */}
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
