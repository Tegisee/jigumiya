import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import PriceChecker from '../../components/PriceChecker';
import { hasCoupangApiKeys, generateDeepLink } from '../../services/coupangApi';
import {
  subscribePriceDrops,
  fetchAllCategoryBest,
} from '../../services/firebase';
import type { PriceDrop, BestProductItem } from '../../types';
import { getAppShareMessage, STORE_LINKS } from '../../services/config';

const DEALS_TARGET = 20;
const BEST_POOL_CACHE_KEY = 'home-deals-best-pool';
const BEST_POOL_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const BEST_POOL_PER_CATEGORY = 5; // 19 × 5 = 95 후보

type DealItem =
  | { type: 'drop'; data: PriceDrop }
  | { type: 'best'; data: BestProductItem };

export default function HomeScreen() {
  const router = useRouter();
  const { trackedItems, syncFromFirestore, backfillProductIds } = useAppStore();
  const items = trackedItems;
  const appStateRef = useRef(AppState.currentState);
  const [checkActive, setCheckActive] = useState(false);
  const lastCheckRef = useRef(0);
  const [drops, setDrops] = useState<PriceDrop[] | null>(null);
  const [bestPool, setBestPool] = useState<BestProductItem[] | null>(null);

  useEffect(() => {
    if (lastCheckRef.current === 0) {
      lastCheckRef.current = Date.now();
      setCheckActive(true);
      setTimeout(() => setCheckActive(false), 120000);
    }

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

  // 오늘의 특가: price_drops 24h 구독
  useEffect(() => {
    const unsub = subscribePriceDrops((next) => setDrops(next), 30, 24);
    return unsub;
  }, []);

  // 오늘의 특가 fallback: category_best 풀 (1h AsyncStorage 캐시)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BEST_POOL_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { ts: number; pool: BestProductItem[] };
          if (
            cached?.pool?.length &&
            Date.now() - cached.ts < BEST_POOL_CACHE_TTL_MS
          ) {
            if (!cancelled) setBestPool(cached.pool);
            return;
          }
        }
      } catch {}
      try {
        const cats = await fetchAllCategoryBest();
        const pool: BestProductItem[] = [];
        for (const cat of cats) {
          const top = (cat.products ?? []).slice(0, BEST_POOL_PER_CATEGORY);
          pool.push(...top);
        }
        if (!cancelled) setBestPool(pool);
        AsyncStorage.setItem(
          BEST_POOL_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), pool }),
        ).catch(() => {});
      } catch {
        if (!cancelled) setBestPool([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const deals = useMemo<DealItem[]>(() => {
    const sortedDrops = drops
      ? [...drops].sort((a, b) => a.dropRate - b.dropRate)
      : [];
    const dropDeals: DealItem[] = sortedDrops
      .slice(0, DEALS_TARGET)
      .map((d) => ({ type: 'drop', data: d }));
    const used = new Set(dropDeals.map((d) => d.data.productId));
    const remain = DEALS_TARGET - dropDeals.length;
    const bestDeals: DealItem[] = [];
    if (remain > 0 && bestPool && bestPool.length > 0) {
      for (const p of bestPool) {
        if (bestDeals.length >= remain) break;
        if (used.has(p.productId)) continue;
        used.add(p.productId);
        bestDeals.push({ type: 'best', data: p });
      }
    }
    return [...dropDeals, ...bestDeals];
  }, [drops, bestPool]);

  const dealsLoaded = drops !== null || bestPool !== null;

  const handleBuyDrop = useCallback(async (drop: PriceDrop) => {
    if (drop.deepLink) {
      try {
        await Linking.openURL(drop.deepLink);
        return;
      } catch {}
    }
    const fallbackUrl = `https://www.coupang.com/vp/products/${drop.productId}`;
    try {
      const dl = await generateDeepLink(fallbackUrl);
      if (dl?.shortenUrl) {
        await Linking.openURL(dl.shortenUrl);
        return;
      }
    } catch {}
    try {
      await Linking.openURL(fallbackUrl);
    } catch {}
  }, []);

  const handleBuyBest = useCallback(async (item: BestProductItem) => {
    try {
      const dl = await generateDeepLink(item.productUrl);
      if (dl?.shortenUrl) {
        await Linking.openURL(dl.shortenUrl);
        return;
      }
    } catch {}
    try {
      await Linking.openURL(item.productUrl);
    } catch {}
  }, []);

  const handleShareApp = async () => {
    try {
      await Share.share({ message: getAppShareMessage() });
    } catch {}
  };

  const renderDeal = (deal: DealItem) => {
    if (deal.type === 'drop') {
      const d = deal.data;
      const dropPct = Math.abs(Math.round(d.dropRate));
      return (
        <TouchableOpacity
          key={`drop-${d.productId}`}
          style={styles.goldboxCard}
          onPress={() => handleBuyDrop(d)}
          activeOpacity={0.8}
        >
          {d.thumbnail ? (
            <Image source={{ uri: d.thumbnail }} style={styles.goldboxImage} />
          ) : (
            <View style={[styles.goldboxImage, styles.goldboxImagePlaceholder]}>
              <Ionicons name="bag-outline" size={16} color={theme.subtext} />
            </View>
          )}
          <View style={styles.goldboxInfo}>
            <Text style={styles.goldboxName} numberOfLines={1}>{d.productName}</Text>
            <View style={styles.dealsPriceRow}>
              <Text style={styles.goldboxPrice} numberOfLines={1}>
                {d.currentPrice.toLocaleString()}원
              </Text>
              <View style={styles.dealsBadge}>
                <Text style={styles.dealsBadgeText}>-{dropPct}%</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    const p = deal.data;
    return (
      <TouchableOpacity
        key={`best-${p.productId}`}
        style={styles.goldboxCard}
        onPress={() => handleBuyBest(p)}
        activeOpacity={0.8}
      >
        {p.productImage ? (
          <Image source={{ uri: p.productImage }} style={styles.goldboxImage} />
        ) : (
          <View style={[styles.goldboxImage, styles.goldboxImagePlaceholder]}>
            <Ionicons name="bag-outline" size={16} color={theme.subtext} />
          </View>
        )}
        <View style={styles.goldboxInfo}>
          <Text style={styles.goldboxName} numberOfLines={1}>{p.productName}</Text>
          <Text style={styles.goldboxPrice} numberOfLines={1}>
            {p.productPrice.toLocaleString()}원
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>지금이야</Text>
        <View style={styles.headerActions}>
          {(STORE_LINKS.ios || STORE_LINKS.android) && (
            <TouchableOpacity
              onPress={handleShareApp}
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Ionicons name="share-outline" size={22} color={theme.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 오늘의 특가 (가격 하락 + 카테고리 베스트 fallback) */}
      {dealsLoaded && (
        <View style={styles.goldboxSection}>
          <View style={styles.goldboxHeader}>
            <Ionicons name="flash" size={14} color="#FFD700" />
            <Text style={styles.goldboxTitle}>오늘의 특가</Text>
          </View>
          {deals.length === 0 ? (
            <Text style={styles.dealsEmpty}>
              아직 가격 변동 데이터가 부족해요. 가격이 내려가면 바로 알려드릴게요!
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.goldboxScroll}
            >
              {deals.map(renderDeal)}
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
  shareBtn: {
    padding: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  dealsPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dealsBadge: {
    backgroundColor: '#E84545',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dealsBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
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
