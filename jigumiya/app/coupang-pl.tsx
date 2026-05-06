import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Linking,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { fetchCoupangPLToday } from '../services/firebase';
import type { CoupangPLDoc, CoupangPLProductItem } from '../types';

const ALL_TAB = '전체';
const FALLBACK_TAB = '기타';

export default function CoupangPLScreen() {
  const router = useRouter();
  const [doc, setDoc] = useState<CoupangPLDoc | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchCoupangPLToday();
      if (!cancelled) setDoc(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const products = doc?.products ?? [];

  // categoryName 으로 자동 탭 생성. 응답에 categoryName 없을 시 '기타'로 묶임.
  const tabs = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      set.add(p.categoryName?.trim() || FALLBACK_TAB);
    }
    const sorted = Array.from(set).sort((a, b) => {
      if (a === FALLBACK_TAB) return 1;
      if (b === FALLBACK_TAB) return -1;
      return a.localeCompare(b, 'ko');
    });
    return [ALL_TAB, ...sorted];
  }, [products]);

  const filtered = useMemo(() => {
    if (activeTab === ALL_TAB) return products;
    return products.filter(
      (p) => (p.categoryName?.trim() || FALLBACK_TAB) === activeTab,
    );
  }, [products, activeTab]);

  const handleBuy = (item: CoupangPLProductItem) => {
    if (!item.deepLink) return;
    try {
      Linking.openURL(item.deepLink);
    } catch {}
  };

  const renderItem = ({ item }: { item: CoupangPLProductItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleBuy(item)}
      activeOpacity={0.8}
    >
      {item.productImage ? (
        <Image source={{ uri: item.productImage }} style={styles.image} />
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
          <Text style={styles.price}>
            {item.productPrice.toLocaleString()}원
          </Text>
          {item.isRocket && <Text style={styles.badge}>🚀</Text>}
          {item.isFreeShipping && (
            <Text style={styles.freeShip}>무료배송</Text>
          )}
        </View>
        {item.categoryName && (
          <Text style={styles.catLabel} numberOfLines={1}>
            {item.categoryName}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>쿠팡 PL</Text>
        <View style={{ width: 32 }} />
      </View>

      {doc === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : doc === null || products.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="hourglass-outline" size={56} color={theme.subtext} />
          <Text style={styles.emptyTitle}>준비 중이에요</Text>
          <Text style={styles.emptyDesc}>
            오늘의 PL 데이터가{'\n'}곧 채워져요
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
          >
            {tabs.map((t) => {
              const active = t === activeTab;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setActiveTab(t)}
                  style={[styles.tab, active && styles.tabActive]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <FlatList
            data={filtered}
            keyExtractor={(p) => p.productId}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyDesc}>
                  이 카테고리는 아직 상품이 없어요
                </Text>
              </View>
            }
            ListFooterComponent={
              <Text style={styles.affiliateText}>
                이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의
                수수료를 제공받습니다.
              </Text>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: { padding: 4 },
  headerTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  tabBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tabActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  tabText: {
    color: theme.subtext,
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 60,
  },
  card: {
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
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  imagePlaceholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, gap: 4 },
  name: { color: theme.text, fontSize: 14, fontWeight: '500' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  price: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  badge: { fontSize: 13 },
  freeShip: {
    color: theme.subtext,
    fontSize: 11,
  },
  catLabel: {
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
    fontSize: 17,
    fontWeight: '600',
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
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
});
