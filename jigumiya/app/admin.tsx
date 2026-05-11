import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import {
  fetchAllSharedProducts,
  adminUpdateRealPrice,
} from '../services/firebase';
import type { SharedProduct } from '../types';
import CoupangScraper, {
  ScrapedProduct,
} from '../components/CoupangScraper';

// docs/023 §관리자 기기 설계
//   - Android: index % 2 === 1 (홀수)
//   - iOS(iPad): index % 2 === 0 (짝수)
//   - 3대 확장 시 modulo 3으로 일반화 — 현재는 2대 가정
const DEVICE_SLOT = Platform.OS === 'android' ? 1 : 0;
const DEVICE_LABEL = Platform.OS === 'android' ? 'Android (홀수)' : 'iOS (짝수)';

const SLEEP_BETWEEN_MS = 1500; // 상품 간 sleep — 쿠팡 봇 차단 회피
const RECENT_RESULT_LIMIT = 15;
const WAIT_OPTIONS = [10, 15, 30, 60, 120] as const; // 분
const DEFAULT_WAIT_MIN = 30;
// 자동 반복 nextRunAt 영속화 — 앱 완전 종료 후 재실행해도 카운트다운 복원.
// setInterval은 백그라운드에서 부정확/멈춤 → wallclock(nextRunAt - Date.now())로 계산.
const STORAGE_KEY_NEXT_RUN = 'admin_nextRunAt';

interface ScrapeResult {
  ok: boolean;
  price?: number;
}

interface ItemResult {
  productId: string;
  productName: string;
  status: 'ok' | 'fail';
  price?: number;
  at: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function AdminScreen() {
  const router = useRouter();

  const [products, setProducts] = useState<SharedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [autoLoop, setAutoLoop] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState<number>(DEFAULT_WAIT_MIN);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentName, setCurrentName] = useState('');
  const [results, setResults] = useState<ItemResult[]>([]);
  const [summary, setSummary] = useState<{ ok: number; fail: number; at: number } | null>(null);
  // 이어서 진행 — 정지/이탈 시 마지막 처리 위치 보존. 1회 순회 완료 시 0으로 리셋.
  const [resumeIdx, setResumeIdx] = useState(0);
  // 다음 자동 순회의 절대 wallclock 시각 (ms epoch). null=대기 안 함. AsyncStorage에 영속.
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  // UI 표시용 남은 초 — 매 tick마다 (nextRunAt - Date.now()) 재계산.
  const [countdownSec, setCountdownSec] = useState<number | null>(null);

  const [scrapeUrl, setScrapeUrl] = useState<string | null>(null);
  const scrapeKeyRef = useRef(0);

  // 현재 처리 중인 promise의 resolver — CoupangScraper 콜백을 매번 새로 연결
  const resolverRef = useRef<((r: ScrapeResult) => void) | null>(null);
  // 순회 중단 신호 (탭 이탈 / 정지 버튼)
  const stopRef = useRef(false);
  // 카운트다운 tick setInterval — 1초마다 wallclock 재계산. 절대 시각은 nextRunAt가 진실.
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // AppState handler stale closure 방지 — 항상 최신 nextRunAt 참조.
  const nextRunAtRef = useRef<number | null>(null);
  nextRunAtRef.current = nextRunAt;
  // runOnce stale closure 방지 — setInterval/AppState 안에서 항상 최신 클로저 호출
  const runOnceRef = useRef<(startFrom?: number) => void>(() => {});

  // 담당 상품 — Platform.OS 기반 홀수/짝수 분배
  const myProducts = useMemo(
    () => products.filter((_, idx) => idx % 2 === DEVICE_SLOT),
    [products],
  );

  // mount: shared_products 전체 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await fetchAllSharedProducts();
      if (cancelled) return;
      setProducts(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // mount: AsyncStorage에서 nextRunAt 복원 — 앱 완전 종료 후 재실행 시 카운트다운 이어감.
  // nextRunAt이 살아있다는 것 = 자동 반복 의도 → autoLoop도 함께 ON 복원.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_NEXT_RUN)
      .then((val) => {
        if (!val) return;
        const at = Number(val);
        if (!Number.isFinite(at) || at <= 0) {
          AsyncStorage.removeItem(STORAGE_KEY_NEXT_RUN).catch(() => {});
          return;
        }
        setNextRunAt(at);
        setAutoLoop(true);
        console.log(
          `[admin] nextRunAt 복원: ${new Date(at).toLocaleTimeString('ko-KR')} (남은 ${Math.max(0, Math.round((at - Date.now()) / 1000))}s)`,
        );
      })
      .catch((e) => console.warn('[admin] nextRunAt 복원 실패:', e));
  }, []);

  // unmount: 진행 중 작업 정리 (tick은 별도 useEffect cleanup에서 정리)
  useEffect(() => {
    return () => {
      stopRef.current = true;
      resolverRef.current?.({ ok: false });
      resolverRef.current = null;
    };
  }, []);

  const handleScrapeResult = useCallback((data: ScrapedProduct) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setScrapeUrl(null);
    r?.({ ok: data.price > 0, price: data.price });
  }, []);

  const handleScrapeError = useCallback((reason?: 'challenge' | 'unknown') => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setScrapeUrl(null);
    if (reason === 'challenge') {
      // 챌린지면 순회 자체 중단 — 다음 상품도 동일하게 차단되므로 헛수고
      stopRef.current = true;
      Alert.alert(
        '쿠팡 봇 차단',
        '쿠팡이 일시적으로 차단 중입니다. 잠시 후 다시 시도해주세요.',
      );
    }
    r?.({ ok: false });
  }, []);

  const scrapeOne = useCallback((item: SharedProduct): Promise<ScrapeResult> => {
    return new Promise((resolve) => {
      const targetUrl = item.resolvedUrl || item.url;
      // link.coupang.com 단축 URL은 스크래핑 불가 — startScrape 정책과 동일
      if (!targetUrl || targetUrl.includes('link.coupang.com')) {
        resolve({ ok: false });
        return;
      }
      resolverRef.current = resolve;
      scrapeKeyRef.current++;
      setScrapeUrl(targetUrl);
      // CoupangScraper 내부 20s timeout이 안전망 — 그래도 안 풀리는 케이스 대비 외부 25s 안전망
      setTimeout(() => {
        if (resolverRef.current === resolve) {
          resolverRef.current = null;
          setScrapeUrl(null);
          resolve({ ok: false });
        }
      }, 25000);
    });
  }, []);

  const runOnce = useCallback(
    async (startFrom: number = 0) => {
      if (myProducts.length === 0) {
        Alert.alert('담당 상품 없음', '인덱스 분배 결과 처리할 상품이 없습니다.');
        return;
      }
      // 카운트다운 진행 중이면 정리 (수동 시작이 카운트다운보다 우선).
      // nextRunAt만 null로 set → ticking useEffect cleanup이 setInterval 해제.
      if (nextRunAt !== null) {
        setNextRunAt(null);
        AsyncStorage.removeItem(STORAGE_KEY_NEXT_RUN).catch(() => {});
      }
      setCountdownSec(null);

      stopRef.current = false;
      setRunning(true);
      // 이어서 시작이면 기존 results/summary 보존, 처음부터면 리셋
      if (startFrom === 0) {
        setResults([]);
        setSummary(null);
      }
      setCurrentIdx(startFrom);

      let ok = 0;
      let fail = 0;
      const newResults: ItemResult[] = [];
      let completedFull = false;

      for (let i = startFrom; i < myProducts.length; i++) {
        if (stopRef.current) {
          // 정지 시 현재 idx를 resumeIdx로 보존 (다음 시작은 i부터)
          setResumeIdx(i);
          break;
        }
        const item = myProducts[i];
        setCurrentIdx(i);
        setCurrentName(item.productName || item.productId);

        const r = await scrapeOne(item);
        if (stopRef.current) {
          setResumeIdx(i);
          break;
        }

        if (r.ok && r.price && r.price > 0) {
          try {
            await adminUpdateRealPrice(item.productId, r.price);
            ok++;
            newResults.unshift({
              productId: item.productId,
              productName: item.productName || item.productId,
              status: 'ok',
              price: r.price,
              at: Date.now(),
            });
          } catch (e) {
            console.warn('[admin] realPrice write 실패:', item.productId, e);
            fail++;
            newResults.unshift({
              productId: item.productId,
              productName: item.productName || item.productId,
              status: 'fail',
              at: Date.now(),
            });
          }
        } else {
          fail++;
          newResults.unshift({
            productId: item.productId,
            productName: item.productName || item.productId,
            status: 'fail',
            at: Date.now(),
          });
        }
        setResults(newResults.slice(0, RECENT_RESULT_LIMIT));

        if (i === myProducts.length - 1) {
          completedFull = true;
        }

        await sleep(SLEEP_BETWEEN_MS);
      }

      setRunning(false);
      setCurrentName('');

      if (completedFull) {
        // 1회 순회 완전 완료 — resume 위치 리셋
        setResumeIdx(0);
        setSummary({ ok, fail, at: Date.now() });
        console.log(`[admin] 순회 완료 ok=${ok} fail=${fail} (총 ${myProducts.length}개)`);

        // 자동 반복: nextRunAt 절대 시각 set + AsyncStorage 저장 → ticking useEffect가 표시/실행.
        if (autoLoop && !stopRef.current) {
          const at = Date.now() + waitMinutes * 60 * 1000;
          setNextRunAt(at);
          AsyncStorage.setItem(STORAGE_KEY_NEXT_RUN, String(at)).catch((e) =>
            console.warn('[admin] nextRunAt 저장 실패:', e),
          );
        }
      } else {
        console.log(`[admin] 순회 정지 (idx=${currentIdx + 1}/${myProducts.length})`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myProducts, autoLoop, waitMinutes, scrapeOne],
  );

  // setInterval/AppState 안에서 stale closure 회피 — 항상 최신 runOnce 호출
  runOnceRef.current = runOnce;

  // nextRunAt 또는 loading 변경 시 wallclock tick 가동/정리.
  // - nextRunAt === null → tick 정리 + countdownSec=null
  // - loading 중 → products 준비 후 다음 사이클에 처리 (만료 시 즉시 실행 회피 안전망)
  // - 미만료 → 1초 tick (남은 시간 = nextRunAt - Date.now())
  // - 만료 → tick 정리 + AsyncStorage clear + setNextRunAt(null) + runOnceRef 호출
  useEffect(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (nextRunAt === null) {
      setCountdownSec(null);
      return;
    }
    if (loading) return; // products 미로드 → 다음 사이클(loading false)에서 재진입

    const tick = () => {
      const ms = nextRunAt - Date.now();
      if (ms <= 0) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownSec(null);
        setNextRunAt(null);
        AsyncStorage.removeItem(STORAGE_KEY_NEXT_RUN).catch(() => {});
        runOnceRef.current(0);
        return;
      }
      setCountdownSec(Math.ceil(ms / 1000));
    };
    tick(); // 즉시 1회 — 만료 상태면 곧바로 실행 (백그라운드에서 만료된 케이스)
    countdownTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [nextRunAt, loading]);

  // AppState 'active' 복귀 시 nextRunAt 만료 검사 — 백그라운드 동안 setInterval 멈춤 보정.
  // (포그라운드 복귀 직후 tick이 즉시 만료 감지하지만, 명시적 핸들러로 confidence 높임)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const at = nextRunAtRef.current;
      if (at === null) return;
      if (Date.now() >= at) {
        console.log('[admin] AppState active — nextRunAt 만료 감지, 즉시 실행');
        setCountdownSec(null);
        setNextRunAt(null);
        AsyncStorage.removeItem(STORAGE_KEY_NEXT_RUN).catch(() => {});
        runOnceRef.current(0);
      }
    });
    return () => sub.remove();
  }, []);

  const handleStop = () => {
    stopRef.current = true;
    resolverRef.current?.({ ok: false });
    resolverRef.current = null;
    setNextRunAt(null);
    AsyncStorage.removeItem(STORAGE_KEY_NEXT_RUN).catch(() => {});
    setRunning(false);
    setCurrentName('');
  };

  // 자동 반복 토글 OFF 시 nextRunAt 즉시 정리 (영속화 포함)
  useEffect(() => {
    if (!autoLoop && nextRunAt !== null) {
      setNextRunAt(null);
      AsyncStorage.removeItem(STORAGE_KEY_NEXT_RUN).catch(() => {});
    }
  }, [autoLoop, nextRunAt]);

  const progress =
    myProducts.length > 0 ? (currentIdx + (running ? 0 : 1)) / myProducts.length : 0;
  const progressPct = Math.min(100, Math.round(progress * 100));

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>관리자 모드</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 기기 상태 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>이 기기</Text>
          <Text style={styles.cardValue}>{DEVICE_LABEL}</Text>
          {loading ? (
            <Text style={styles.cardDesc}>shared_products 로딩 중...</Text>
          ) : (
            <Text style={styles.cardDesc}>
              담당 {myProducts.length}개 / 전체 {products.length}개
            </Text>
          )}
        </View>

        {/* 시작/정지 + 자동 반복 */}
        <View style={styles.card}>
          {!running ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.startBtn, loading && styles.btnDisabled]}
              onPress={() => runOnce(resumeIdx)}
              disabled={loading || myProducts.length === 0}
              activeOpacity={0.8}
            >
              <Ionicons name="play" size={18} color="#000" />
              <Text style={styles.actionText}>
                {resumeIdx > 0
                  ? `${resumeIdx + 1}번부터 이어서 시작`
                  : '순회 시작'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.stopBtn]}
              onPress={handleStop}
              activeOpacity={0.8}
            >
              <Ionicons name="stop" size={18} color="#fff" />
              <Text style={[styles.actionText, { color: '#fff' }]}>정지</Text>
            </TouchableOpacity>
          )}

          {resumeIdx > 0 && !running && (
            <TouchableOpacity
              style={styles.resetLink}
              onPress={() => setResumeIdx(0)}
              activeOpacity={0.6}
            >
              <Ionicons name="refresh" size={14} color={theme.subtext} />
              <Text style={styles.resetLinkText}>처음부터 다시 시작</Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>순회 완료 후 자동 반복</Text>
              <Text style={styles.desc}>화면이 켜져 있는 동안만 동작</Text>
            </View>
            <Switch
              value={autoLoop}
              onValueChange={setAutoLoop}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.text}
            />
          </View>

          {autoLoop && (
            <>
              <Text style={styles.waitLabel}>대기 시간</Text>
              <View style={styles.chipGroup}>
                {WAIT_OPTIONS.map((m) => {
                  const active = waitMinutes === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setWaitMinutes(m)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {m}분
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* 진행 상황 */}
        {running && (
          <View style={styles.card}>
            <View style={styles.progressHeader}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.progressTitle}>
                {currentIdx + 1} / {myProducts.length} ({progressPct}%)
              </Text>
            </View>
            {currentName ? (
              <Text style={styles.currentName} numberOfLines={1}>
                {currentName}
              </Text>
            ) : null}
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
            </View>
          </View>
        )}

        {/* 카운트다운 — 순회 완료 후 자동 반복 대기 중 */}
        {countdownSec !== null && countdownSec > 0 && (
          <View style={[styles.card, styles.countdownCard]}>
            <Text style={styles.cardLabel}>다음 순회까지</Text>
            <Text style={styles.countdownText}>
              {Math.floor(countdownSec / 60)}분 {countdownSec % 60}초
            </Text>
            <Text style={styles.cardDesc}>0초가 되면 자동으로 순회를 시작합니다</Text>
          </View>
        )}

        {/* 요약 */}
        {summary && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>최근 순회 결과</Text>
            <Text style={styles.summaryText}>
              ✅ {summary.ok}개 성공 / ❌ {summary.fail}개 실패
            </Text>
            <Text style={styles.cardDesc}>
              {new Date(summary.at).toLocaleTimeString('ko-KR')}
              {autoLoop && !running && countdownSec === null
                ? ` · ${waitMinutes}분 후 자동 재시작`
                : ''}
            </Text>
          </View>
        )}

        {/* 최근 결과 리스트 */}
        {results.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>최근 {results.length}개</Text>
            {results.map((r) => (
              <View key={`${r.productId}-${r.at}`} style={styles.resultRow}>
                <Text
                  style={[
                    styles.resultIcon,
                    { color: r.status === 'ok' ? '#4CAF50' : '#FF6666' },
                  ]}
                >
                  {r.status === 'ok' ? '✅' : '❌'}
                </Text>
                <Text style={styles.resultName} numberOfLines={1}>
                  {r.productName}
                </Text>
                {r.price ? (
                  <Text style={styles.resultPrice}>{r.price.toLocaleString()}원</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* hidden WebView — 1회용 promise 기반 */}
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
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: theme.text },
  scroll: { padding: 16, gap: 16 },

  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    gap: 6,
  },
  cardLabel: { fontSize: 12, color: theme.subtext, fontWeight: '600' },
  cardValue: { fontSize: 18, color: theme.text, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: theme.subtext },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  startBtn: { backgroundColor: theme.primary },
  stopBtn: { backgroundColor: '#CC3333' },
  btnDisabled: { opacity: 0.5 },
  actionText: { fontSize: 16, fontWeight: '700', color: '#000' },

  divider: { height: 1, backgroundColor: theme.border, marginVertical: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 15, color: theme.text, fontWeight: '500' },
  desc: { fontSize: 12, color: theme.subtext },

  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTitle: { fontSize: 14, color: theme.text, fontWeight: '600' },
  currentName: { fontSize: 13, color: theme.subtext, marginTop: 4 },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.primary,
  },

  summaryText: { fontSize: 16, color: theme.text, fontWeight: '600' },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  resultIcon: { fontSize: 14, width: 20 },
  resultName: { flex: 1, fontSize: 13, color: theme.text },
  resultPrice: { fontSize: 13, color: theme.subtext, fontVariant: ['tabular-nums'] },

  resetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  resetLinkText: { fontSize: 13, color: theme.subtext },

  waitLabel: {
    fontSize: 13,
    color: theme.subtext,
    fontWeight: '500',
    marginTop: 8,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
  },
  chipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipText: { fontSize: 13, color: theme.subtext, fontWeight: '500' },
  chipTextActive: { color: '#000', fontWeight: '700' },

  countdownCard: { borderColor: theme.primary },
  countdownText: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.primary,
    fontVariant: ['tabular-nums'],
  },
});
