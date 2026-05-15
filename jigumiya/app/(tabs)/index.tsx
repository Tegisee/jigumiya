import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Share,
  ScrollView,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import PriceChecker from '../../components/PriceChecker';
import { hasCoupangApiKeys, generateDeepLink } from '../../services/coupangApi';
import {
  fetchActiveJigumiyaEvent,
  fetchGoldboxToday,
} from '../../services/firebase';
import type {
  EventBestJigumiya,
  GoldboxProductItem,
} from '../../types';
import {
  getAppShareMessage,
  STORE_LINKS,
  MAX_TRACKED_ITEMS,
} from '../../services/config';

export default function HomeScreen() {
  const router = useRouter();
  const { trackedItems, syncFromFirestore, backfillProductIds } = useAppStore();
  const appStateRef = useRef(AppState.currentState);
  const [goldbox, setGoldbox] = useState<GoldboxProductItem[] | null>(null);
  const [activeEvent, setActiveEvent] = useState<{
    event: EventBestJigumiya;
    daysUntil: number;
  } | null>(null);
  // 1.0.17 자동 새로고침 트리거. mount + 포그라운드 복귀마다 토글링으로 PriceChecker useEffect 재실행.
  // PriceChecker 내부 runningRef로 중복 실행 방지, TTL 6h 가드로 최근 체크는 자동 스킵.
  const [checkTrigger, setCheckTrigger] = useState(0);

  useEffect(() => {
    // productId 누락 항목 자가 치유 (단축 URL resolve 실패로 하트 버튼 사라진 케이스 복구)
    backfillProductIds();
    // 콜드 스타트 자동 새로고침 트리거 — sync 후 약간 지연으로 trackedItems 머지 완료 대기
    const coldStartTimer = setTimeout(() => setCheckTrigger((n) => n + 1), 3000);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        syncFromFirestore();
        // sync 머지 완료 + 알림 라우팅 등 안정화 후 트리거
        setTimeout(() => setCheckTrigger((n) => n + 1), 2000);
      }
      appStateRef.current = nextState;
    });

    return () => {
      clearTimeout(coldStartTimer);
      sub.remove();
    };
  }, [syncFromFirestore, backfillProductIds]);

  // 활성 이벤트(D-7 이내): event_best_jigumiya 1회 조회. 활성 시 풀-width 배너 노출.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchActiveJigumiyaEvent();
      if (!cancelled) setActiveEvent(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 골드박스: goldbox/{오늘 KST} 1회 조회 (어제 fallback). 가로 스크롤 카드용.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchGoldboxToday();
      if (!cancelled) setGoldbox(result?.products ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 1.0.17: 추적 현황 — 가격 하락/상승 카운트.
  // 기준: trackedItem.priceHistory의 마지막 vs 이전 항목 비교 (detail/[id]의 hasPriceDrop와 동일 정책).
  // priceHistory가 1개 이하면 비교 불가 → 무변동으로 처리.
  const { drops, ups } = useMemo(() => {
    let d = 0;
    let u = 0;
    for (const item of trackedItems) {
      const hist = item.priceHistory;
      if (hist.length < 2) continue;
      const prev = hist[hist.length - 2].price;
      if (item.currentPrice < prev) d++;
      else if (item.currentPrice > prev) u++;
    }
    return { drops: d, ups: u };
  }, [trackedItems]);

  const trackedCount = trackedItems.length;
  const remainingSlots = Math.max(0, MAX_TRACKED_ITEMS - trackedCount);

  const handleBuyGoldbox = (item: GoldboxProductItem) => {
    if (!item.deepLink) return;
    try {
      Linking.openURL(item.deepLink);
    } catch {}
  };

  const handleShareApp = async () => {
    try {
      await Share.share({ message: getAppShareMessage() });
    } catch {}
  };

  const handleOpenCoupang = async () => {
    // 제휴 딥링크로 쿠팡 이동 (수수료 발생)
    if (hasCoupangApiKeys()) {
      try {
        const deepLink = await generateDeepLink('https://www.coupang.com');
        if (deepLink?.shortenUrl) {
          Linking.openURL(deepLink.shortenUrl);
          return;
        }
      } catch {}
    }
    // fallback: 쿠팡 앱 또는 웹
    try {
      const canOpen = await Linking.canOpenURL('coupang://home');
      if (canOpen) {
        await Linking.openURL('coupang://home');
        return;
      }
    } catch {}
    Linking.openURL('https://www.coupang.com');
  };

  const renderGoldboxCard = (item: GoldboxProductItem) => (
    <TouchableOpacity
      key={`gold-${item.productId}`}
      style={styles.goldboxCard}
      onPress={() => handleBuyGoldbox(item)}
      activeOpacity={0.8}
    >
      {item.productImage ? (
        <Image
          source={{ uri: item.productImage }}
          style={styles.goldboxImage}
          cachePolicy="memory-disk"
          recyclingKey={item.productId}
          contentFit="cover"
          transition={0}
        />
      ) : (
        <View style={[styles.goldboxImage, styles.goldboxImagePlaceholder]}>
          <Ionicons name="bag-outline" size={16} color={theme.subtext} />
        </View>
      )}
      <View style={styles.goldboxInfo}>
        <Text style={styles.goldboxName} numberOfLines={1}>
          {item.productName}
        </Text>
        <Text style={styles.goldboxPrice} numberOfLines={1}>
          {item.productPrice.toLocaleString()}원
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>지금이야</Text>
          {(STORE_LINKS.ios || STORE_LINKS.android) && (
            <TouchableOpacity
              onPress={handleShareApp}
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Ionicons name="share-outline" size={22} color={theme.text} />
            </TouchableOpacity>
          )}
        </View>

        {/* 상단 버튼 — 이벤트 배너(있을 때) + 오늘의 BEST + 쿠팡 PL */}
        <View style={styles.topButtons}>
          {activeEvent && (
            <TouchableOpacity
              style={styles.eventBanner}
              onPress={() =>
                router.push({
                  pathname: '/event-best',
                  params: { slug: activeEvent.event.slug },
                })
              }
              activeOpacity={0.85}
            >
              <Text style={styles.eventEmoji}>🌸</Text>
              <View style={styles.eventTextWrap}>
                <Text style={styles.eventName} numberOfLines={1}>
                  {activeEvent.event.eventName}
                </Text>
                <Text style={styles.eventDLabel}>
                  {activeEvent.daysUntil === 0
                    ? 'D-day'
                    : `D-${activeEvent.daysUntil}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.text} />
            </TouchableOpacity>
          )}
          <View style={styles.topButtonRow}>
            <TouchableOpacity
              style={[styles.topButton, styles.topButtonBest]}
              onPress={() => router.push('/today-best')}
              activeOpacity={0.85}
            >
              <Text style={styles.topButtonEmoji}>⚡</Text>
              <Text style={styles.topButtonText}>오늘의 BEST</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.topButton, styles.topButtonPL]}
              onPress={() => router.push('/coupang-pl')}
              activeOpacity={0.85}
            >
              <Text style={styles.topButtonEmoji}>🏷️</Text>
              <Text style={styles.topButtonText}>쿠팡 PL</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 골드박스 — goldbox/{오늘 KST} (cron 07:30) */}
        {goldbox !== null && (
          <View style={styles.goldboxSection}>
            <View style={styles.goldboxHeader}>
              <Ionicons name="cube" size={14} color="#FFD700" />
              <Text style={styles.goldboxTitle}>쿠팡 골드박스</Text>
            </View>
            {goldbox.length === 0 ? (
              <Text style={styles.dealsEmpty}>
                오늘 골드박스 데이터가 아직 준비되지 않았어요
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.goldboxScroll}
              >
                {goldbox.map(renderGoldboxCard)}
              </ScrollView>
            )}
          </View>
        )}

        {/* 1.0.17 §앱구조 개편 — 추적 현황 박스 (추적중 탭 진입 동선) */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>
              {trackedCount}개 추적중
            </Text>
            <Text style={styles.statusSub}>
              {remainingSlots > 0
                ? `앞으로 ${remainingSlots}개 상품을 추가로 추적할 수 있어요`
                : `한도 ${MAX_TRACKED_ITEMS}개 도달 — 기존 상품을 삭제하면 추가할 수 있어요`}
            </Text>
          </View>
          <View style={styles.statusStats}>
            <View style={[styles.statusStat, styles.statusStatDown]}>
              <Ionicons name="trending-down" size={16} color="#FF6B6B" />
              <Text style={styles.statusStatText}>가격 하락 {drops}개</Text>
            </View>
            <View style={[styles.statusStat, styles.statusStatUp]}>
              <Ionicons name="trending-up" size={16} color="#FFB02E" />
              <Text style={styles.statusStatText}>가격 상승 {ups}개</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.statusLink}
            onPress={() => router.push('/tracked')}
            activeOpacity={0.7}
          >
            <Text style={styles.statusLinkText}>추적중인 상품 보기</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.primary} />
          </TouchableOpacity>
        </View>

        {/* 1.0.17 §앱구조 개편 — 쿠팡 바로가기 (묻어가는 스타일, 추적상품 가져오기 교체) */}
        <TouchableOpacity
          style={styles.coupangLinkBtn}
          onPress={handleOpenCoupang}
          activeOpacity={0.7}
        >
          <View style={styles.coupangLinkText}>
            <Text style={styles.coupangLinkTitle}>🛍️ 쿠팡 바로가기</Text>
            <Text style={styles.coupangLinkSub}>
              눌러서 상품을 공유하면 가격 추적이 시작돼요
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.subtext} />
        </TouchableOpacity>

        <Text style={styles.affiliateText}>
          이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>
      </ScrollView>

      {/* 1.0.17 포그라운드 자동 새로고침 — TTL 6h + viewport 우선 + 3~8s 지터 (Akamai 완화) */}
      <PriceChecker active={checkTrigger > 0} key={checkTrigger} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scroll: {
    paddingBottom: 0,
    // 1.0.19 §3 (docs/025): 콘텐츠가 적을 때 화면 하단까지 배경이 채워지도록.
    // 많을 때는 자연 스크롤 — flexGrow:1은 최소 높이만 보장.
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
  },
  iconBtn: {
    padding: 6,
  },
  affiliateText: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },

  // ── 상단 버튼 (이벤트 배너 + 오늘의 BEST + 쿠팡 PL) ──
  topButtons: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  eventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 105, 180, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 105, 180, 0.35)',
    borderRadius: 12,
  },
  eventEmoji: {
    fontSize: 20,
  },
  eventTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventName: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  eventDLabel: {
    color: '#FF69B4',
    fontSize: 13,
    fontWeight: '700',
  },
  topButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  topButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  topButtonBest: {
    backgroundColor: 'rgba(0, 229, 204, 0.10)',
    borderColor: 'rgba(0, 229, 204, 0.35)',
  },
  topButtonPL: {
    backgroundColor: 'rgba(255, 215, 0, 0.10)',
    borderColor: 'rgba(255, 215, 0, 0.35)',
  },
  topButtonEmoji: {
    fontSize: 16,
  },
  topButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── 추적 현황 박스 ──
  statusCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 12,
  },
  statusHeader: {
    gap: 4,
  },
  statusTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  statusSub: {
    color: theme.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  statusStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statusStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusStatDown: {
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderColor: 'rgba(255, 107, 107, 0.30)',
  },
  statusStatUp: {
    backgroundColor: 'rgba(255, 176, 46, 0.08)',
    borderColor: 'rgba(255, 176, 46, 0.30)',
  },
  statusStatText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  statusLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 229, 204, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 204, 0.35)',
  },
  statusLinkText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── 쿠팡 바로가기 (묻어가는 스타일) ──
  coupangLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  coupangLinkText: {
    flex: 1,
  },
  coupangLinkTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  coupangLinkSub: {
    color: theme.subtext,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },

  // ── 오늘의 특가 (가격 하락 + 카테고리 베스트 fallback, 상단 고정 컴팩트) ──
  goldboxSection: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  goldboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  goldboxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  goldboxScroll: {
    gap: 8,
    paddingHorizontal: 20,
  },
  goldboxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 8,
    gap: 8,
    width: 200,
  },
  goldboxImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  goldboxImagePlaceholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldboxInfo: {
    flex: 1,
  },
  goldboxName: {
    color: theme.text,
    fontSize: 12,
    marginBottom: 2,
  },
  goldboxPrice: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  dealsEmpty: {
    color: theme.subtext,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    lineHeight: 18,
  },
});
