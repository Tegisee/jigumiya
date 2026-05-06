import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Share,
  Image,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { ProductCard } from '../../components/ProductCard';
import { hasCoupangApiKeys, generateDeepLink } from '../../services/coupangApi';
import {
  fetchActiveJigumiyaEvent,
  fetchGoldboxToday,
} from '../../services/firebase';
import type {
  EventBestJigumiya,
  GoldboxProductItem,
} from '../../types';
import { getAppShareMessage, STORE_LINKS } from '../../services/config';

export default function HomeScreen() {
  const router = useRouter();
  const { trackedItems, syncFromFirestore, backfillProductIds } = useAppStore();
  const items = trackedItems;
  const appStateRef = useRef(AppState.currentState);
  const [goldbox, setGoldbox] = useState<GoldboxProductItem[] | null>(null);
  const [activeEvent, setActiveEvent] = useState<{
    event: EventBestJigumiya;
    daysUntil: number;
  } | null>(null);

  useEffect(() => {
    // productId 누락 항목 자가 치유 (단축 URL resolve 실패로 하트 버튼 사라진 케이스 복구)
    backfillProductIds();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        syncFromFirestore();
      }
      appStateRef.current = nextState;
    });

    return () => sub.remove();
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

  const renderGoldboxCard = (item: GoldboxProductItem) => (
    <TouchableOpacity
      key={`gold-${item.productId}`}
      style={styles.goldboxCard}
      onPress={() => handleBuyGoldbox(item)}
      activeOpacity={0.8}
    >
      {item.productImage ? (
        <Image source={{ uri: item.productImage }} style={styles.goldboxImage} />
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
            onPress={() => router.push('/today-best')}
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

      {/* 추적상품 가져오기 */}
      <TouchableOpacity
        style={styles.fetchBtn}
        onPress={async () => {
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
            if (canOpen) { await Linking.openURL('coupang://home'); return; }
          } catch {}
          Linking.openURL('https://www.coupang.com');
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="cart-outline" size={22} color={theme.primary} />
        <View style={styles.fetchBtnText}>
          <Text style={styles.fetchBtnTitle}>추적상품 가져오기</Text>
          <Text style={styles.fetchBtnSub}>쿠팡에서 마음에 드는 상품을 찾아오세요</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
      </TouchableOpacity>

      {/* 카테고리 제목 고정 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>가격 추적 중</Text>
        <Text style={styles.sectionCount}>{items.length}개</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard item={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              쿠팡에서 상품 공유하기를 눌러보세요
            </Text>
          </View>
        }
        ListFooterComponent={
          items.length > 0 ? (
            <Text style={styles.affiliateText}>
              이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
            </Text>
          ) : null
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/modal/add-item')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* PriceChecker 비활성화 — 파트너스 API 승인 후 재활성화 예정 */}
      {/* <PriceChecker active={checkActive} /> */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 200,
  },
  emptyText: {
    color: theme.subtext,
    fontSize: 16,
  },
  affiliateText: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 16,
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

  // ── 추적상품 가져오기 ──
  fetchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    backgroundColor: 'rgba(0, 229, 204, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 204, 0.25)',
    borderRadius: 14,
  },
  fetchBtnText: {
    flex: 1,
  },
  fetchBtnTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fetchBtnSub: {
    color: theme.subtext,
    fontSize: 12,
    marginTop: 2,
  },

  // ── 섹션 헤더 ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  sectionCount: {
    fontSize: 13,
    color: theme.subtext,
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

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: theme.text,
    lineHeight: 30,
  },
});
