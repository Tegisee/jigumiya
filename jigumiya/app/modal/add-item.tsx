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

/** 1.0.19 §1 — WebView 제거 후 Functions 응답이 가진 메타데이터를 그대로 사용. */
interface ResolvedMeta {
  resolvedUrl: string;
  affiliateUrl: string;
  productName: string;
  productImage: string;
  apiPrice: number;
}

type Step = 'url' | 'resolving' | 'target';

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
  const [meta, setMeta] = useState<ResolvedMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const isFromShare = !!sharedUrl;
  // 'url' 외 단계 진행 중에 expo-router 캐싱으로 인한 state 리셋 방지 (rare)
  const stepRef = useRef<Step>('url');
  stepRef.current = step;

  // 모달 mount 시 Functions 워밍업 — 사용자가 URL 확인 + "다음" 누르는 1~2s 동안 컨테이너 init.
  useEffect(() => {
    warmupResolveAffiliate();
  }, []);

  // 모달이 다시 열릴 때 state 초기화 (expo-router 캐싱 대응). 진행 중에는 보존.
  useFocusEffect(
    useCallback(() => {
      if (stepRef.current !== 'url') return;
      setUrl(sharedUrl ?? '');
      setTargetPrice('');
      setStep('url');
      setMeta(null);
      setSaving(false);
    }, [sharedUrl])
  );

  const suggestedPrice = meta?.apiPrice ? Math.round(meta.apiPrice * 0.9) : null;

  // 1단계: "다음" 버튼 → 사전 검증 → resolve
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
    await resolveFromUrl(parsedUrl);
  };

  /**
   * 1.0.19 §1 — Functions 우선, 실패 시 클라이언트 fallback.
   * 성공: resolvedUrl + affiliateUrl + 메타데이터(상품명/이미지/apiPrice) 확보 → target 단계
   * Functions ok=false: 클라이언트가 link.coupang.com을 직접 풀고 affiliate만 확보. 메타데이터는 빈값(cron이 채움)
   */
  const resolveFromUrl = async (parsedUrl: string) => {
    setStep('resolving');
    setMeta(null);

    let resolvedUrl = parsedUrl;
    let affiliateUrl = parsedUrl;
    let productName = '';
    let productImage = '';
    let apiPrice = 0;

    const t0 = Date.now();
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
      resolvedUrl = functionsResult.originalUrl;
      affiliateUrl = functionsResult.shortenUrl;
      productName = functionsResult.productName ?? '';
      productImage = functionsResult.productImage ?? '';
      apiPrice = functionsResult.apiPrice ?? 0;
      console.log(
        '[AddItem] Functions 성공:',
        affiliateUrl.slice(0, 60),
        `meta(name=${!!productName} img=${!!productImage} price=${apiPrice})`,
      );
    } else {
      console.warn(
        '[AddItem] Functions 실패 → client fallback:',
        functionsResult.error,
        functionsResult.detail,
      );
      // 단축 URL은 200 + JS hex-escape redirectWebUrl 응답. 3단 fallback 시도.
      if (parsedUrl.includes('link.coupang.com')) {
        try {
          const res = await fetchWithTimeout(parsedUrl, { redirect: 'manual' }, 5000);
          const location = res.headers.get('location');
          if (location && location.includes('coupang.com')) {
            resolvedUrl = location;
          } else if (res.status === 200) {
            const html = await res.text();
            const extracted = extractRedirectUrlFromHtml(html);
            if (extracted) resolvedUrl = extracted;
          }
          if (resolvedUrl === parsedUrl) {
            const res2 = await fetchWithTimeout(parsedUrl, { redirect: 'follow' }, 5000);
            if (res2.url && res2.url.includes('coupang.com') && res2.url !== parsedUrl) {
              resolvedUrl = res2.url;
            } else if (res2.status === 200) {
              const html2 = await res2.text();
              const extracted2 = extractRedirectUrlFromHtml(html2);
              if (extracted2) resolvedUrl = extracted2;
            }
          }
        } catch (e) {
          console.warn('[AddItem] fallback resolve 실패:', e);
        }
      }
      // 제휴 딥링크는 클라이언트 키가 있을 때만 fallback
      if (hasCoupangApiKeys() && resolvedUrl.includes('coupang.com') && resolvedUrl !== parsedUrl) {
        try {
          const deepLink = await withTimeout(
            generateDeepLink(resolvedUrl),
            5000,
            'deeplink',
          );
          if (deepLink?.shortenUrl) {
            affiliateUrl = deepLink.shortenUrl;
            console.log('[AddItem] client 제휴 링크:', deepLink.shortenUrl.slice(0, 60));
          }
        } catch {}
      }
      // 메타데이터는 비워둠 — cron이 채워줌. 사용자에겐 임시 라벨로 표시.
    }

    // 메타데이터 fallback — Functions가 빈 응답이면 공유 텍스트에서 상품명 시도
    if (!productName) {
      productName = parseProductName(sharedText || '');
    }

    setMeta({ resolvedUrl, affiliateUrl, productName, productImage, apiPrice });
    setStep('target');
  };

  // 2단계: "저장" 버튼 — priceStatus='INIT'으로 즉시 저장 + 모달 종료
  const handleSave = async () => {
    if (!meta) return;
    setSaving(true);

    const productName = meta.productName || '상품 정보 없음';
    const apiPrice = meta.apiPrice;
    const thumbnail = meta.productImage;

    // URL에서 productId/vendorItemId 추출 (다중 후보 시도)
    const ids = extractIds(meta.resolvedUrl, meta.affiliateUrl, url);

    // 1.0.19 §1 — INIT 상태로 즉시 저장. realPrice는 cron/관리자/자동 새로고침이 백그라운드 갱신.
    // currentPrice는 표시용 fallback으로 apiPrice를 mirror (그래프엔 사용 안 함 — priceHistory 빔).
    // priceHistory는 INIT 상태에서 빈 배열 — 첫 realPrice 도착 시 SYNCING으로 전이하며 1점 시작.
    await addItem({
      id: Date.now().toString(),
      url: meta.affiliateUrl,
      resolvedUrl: meta.resolvedUrl,
      productId: ids.productId,
      vendorItemId: ids.vendorItemId,
      productName,
      currentPrice: apiPrice, // INIT fallback. realPrice 도착 시 store의 updateItemPrice가 덮어씀.
      apiPrice: apiPrice > 0 ? apiPrice : undefined,
      targetPrice: targetPrice.trim() ? Number(targetPrice) : undefined,
      thumbnail,
      priceHistory: [],
      priceStatus: 'INIT',
      createdAt: Date.now(),
    });

    setSaving(false);
    if (isFromShare) {
      router.replace('/');
    } else {
      router.back();
    }
  };

  const goBack = () => {
    if (step === 'target' || step === 'resolving') {
      setMeta(null);
      setStep('url');
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

        {/* ── resolving (Functions 호출 중, 목표 2초 이내) ── */}
        {step === 'resolving' && (
          <View style={styles.scrapingBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.scrapingText}>링크 확인 중...</Text>
          </View>
        )}

        {/* ── 2단계: apiPrice 표시 + 목표가 입력 ── */}
        {step === 'target' && meta && (
          <>
            {(meta.productName || meta.apiPrice > 0) && (
              <View style={styles.previewCard}>
                <Text style={styles.previewName} numberOfLines={2}>
                  {meta.productName || '상품 정보 없음'}
                </Text>
                {meta.apiPrice > 0 && (
                  <Text style={styles.previewPrice}>
                    예상가 {meta.apiPrice.toLocaleString()}원
                  </Text>
                )}
                <Text style={styles.previewHint}>
                  정확한 현재가는 곧 갱신됩니다
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

  // resolving
  scrapingBox: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 40,
  },
  scrapingText: {
    color: theme.subtext,
    fontSize: 15,
  },

  // 2단계: 미리보기 카드
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
  previewHint: {
    color: theme.subtext,
    fontSize: 12,
    marginTop: 2,
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
