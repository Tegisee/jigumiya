import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Linking,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../../constants/theme';
import { subscribePriceDrops } from '../../services/firebase';
import { generateDeepLink } from '../../services/coupangApi';
import type { PriceDrop } from '../../types';

type FilterKey = 'all' | 'over10' | 'over20';

const FILTERS: { key: FilterKey; label: string; min: number }[] = [
  { key: 'all', label: '전체', min: 0 },
  { key: 'over10', label: '-10% 이상', min: 10 },
  { key: 'over20', label: '-20% 이상', min: 20 },
];

export default function PriceDropsScreen() {
  const router = useRouter();
  const [drops, setDrops] = useState<PriceDrop[] | null>(null); // null = 미로드
  const [filter, setFilter] = useState<FilterKey>('all');
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const subscribe = () => {
      unsubRef.current = subscribePriceDrops((next) => setDrops(next));
    };
    subscribe();

    // iOS 쿠팡 앱 복귀 시 Firestore 스트림 stall → active 전환마다 unsub + 재구독.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        unsubRef.current?.();
        subscribe();
      }
    });

    return () => {
      unsubRef.current?.();
      sub.remove();
    };
  }, []);

  // 클라이언트 측 보강: 하락률 큰 순 정렬 (인덱스 부담 회피)
  const sorted = useMemo(() => {
    if (!drops) return [];
    return [...drops].sort((a, b) => a.dropRate - b.dropRate);
  }, [drops]);

  const filtered = useMemo(() => {
    const minDropPct = FILTERS.find((f) => f.key === filter)?.min ?? 0;
    return sorted.filter((d) => Math.abs(d.dropRate) >= minDropPct);
  }, [sorted, filter]);

  const handleBuy = async (drop: PriceDrop) => {
    if (drop.deepLink) {
      try {
        await Linking.openURL(drop.deepLink);
        return;
      } catch {}
    }
    // deepLink 실패 시 productId 기반 쿠팡 URL 생성 + 변환 시도
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
  };

  const renderItem = ({ item }: { item: PriceDrop }) => {
    const dropPct = Math.abs(item.dropRate);
    const tone =
      dropPct >= 20 ? styles.dropSevere : dropPct >= 10 ? styles.dropMid : styles.dropMild;

    return (
      <TouchableOpacity
        style={styles.cardInner}
        onPress={() => handleBuy(item)}
        activeOpacity={0.8}
      >
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="bag-outline" size={28} color={theme.subtext} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {item.productName}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.prevPrice}>
              {item.prevPrice.toLocaleString()}원
            </Text>
            <Ionicons
              name="arrow-forward"
              size={12}
              color={theme.subtext}
              style={{ marginHorizontal: 4 }}
            />
            <Text style={styles.currentPrice}>
              {item.currentPrice.toLocaleString()}원
            </Text>
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.dropBadge, tone]}>
              <Text style={styles.dropText}>
                {item.dropRate > 0 ? '+' : ''}
                {item.dropRate.toFixed(1)}%
              </Text>
            </View>
            {item.trackerCount > 0 && (
              <Text style={styles.tracker}>
                🔥 {item.trackerCount}명 추적 중
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>가격변동</Text>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={styles.settingsBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterText,
                  active && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {drops === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="trending-down-outline"
            size={56}
            color={theme.subtext}
          />
          <Text style={styles.emptyTitle}>
            {drops.length === 0
              ? '최근 24시간 가격 하락이 없어요'
              : '해당 필터에 일치하는 항목이 없어요'}
          </Text>
          <Text style={styles.emptyDesc}>
            {drops.length === 0
              ? '추적 중인 상품이 늘어날수록\n더 많은 변동이 표시돼요'
              : '필터를 완화하거나 잠시 후 다시 확인해주세요'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => `${item.productId}-${item.createdAt}-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListFooterComponent={
            <Text style={styles.affiliateText}>
              이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를
              제공받습니다.
            </Text>
          }
        />
      )}
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
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
  },
  settingsBtn: {
    padding: 6,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  filterText: {
    color: theme.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  imagePlaceholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prevPrice: {
    color: theme.subtext,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  currentPrice: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  dropBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dropMild: {
    backgroundColor: 'rgba(0, 229, 204, 0.18)',
  },
  dropMid: {
    backgroundColor: 'rgba(255, 153, 0, 0.22)',
  },
  dropSevere: {
    backgroundColor: 'rgba(255, 59, 48, 0.25)',
  },
  dropText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '700',
  },
  tracker: {
    color: theme.subtext,
    fontSize: 11,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  emptyDesc: {
    color: theme.subtext,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  affiliateText: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
});
