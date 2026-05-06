import { useCallback, useEffect, useRef, useState } from 'react';
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
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { fetchAllCategoryBest } from '../services/firebase';
import type { CategoryBest, BestProductItem } from '../types';

const PREVIEW_COUNT = 3;

export default function TodayBestScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryBest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const cancelledRef = useRef(false);
  const categoriesRef = useRef<CategoryBest[]>([]);

  const reload = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    const data = await fetchAllCategoryBest();
    if (cancelledRef.current) return;
    categoriesRef.current = data;
    setCategories(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    reload(true);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') reload(categoriesRef.current.length === 0);
    });
    return () => {
      cancelledRef.current = true;
      sub.remove();
    };
  }, [reload]);

  const toggleExpand = (categoryId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleBuy = (item: BestProductItem) => {
    try {
      Linking.openURL(item.productUrl);
    } catch {}
  };

  const renderHorizontalCard = (item: BestProductItem) => (
    <TouchableOpacity
      key={`${item.rank}-${item.productId}`}
      style={styles.hCard}
      onPress={() => handleBuy(item)}
      activeOpacity={0.8}
    >
      <View style={styles.imageWrap}>
        {item.productImage ? (
          <Image source={{ uri: item.productImage }} style={styles.hImage} />
        ) : (
          <View style={[styles.hImage, styles.imagePlaceholder]}>
            <Ionicons name="bag-outline" size={28} color={theme.subtext} />
          </View>
        )}
        <View style={[styles.rankBadge, item.rank <= 3 && styles.rankBadgeTop]}>
          <Text style={styles.rankText}>{item.rank}</Text>
        </View>
      </View>
      <Text style={styles.hName} numberOfLines={2}>
        {item.productName}
      </Text>
      <View style={styles.hPriceRow}>
        <Text style={styles.hPrice} numberOfLines={1}>
          {item.productPrice.toLocaleString()}원
        </Text>
        {item.isRocket && <Text style={styles.rocket}>🚀</Text>}
      </View>
    </TouchableOpacity>
  );

  const renderExpandedRow = (item: BestProductItem) => (
    <TouchableOpacity
      key={`exp-${item.rank}-${item.productId}`}
      style={styles.vCard}
      onPress={() => handleBuy(item)}
      activeOpacity={0.8}
    >
      <View style={styles.imageWrap}>
        {item.productImage ? (
          <Image source={{ uri: item.productImage }} style={styles.vImage} />
        ) : (
          <View style={[styles.vImage, styles.imagePlaceholder]}>
            <Ionicons name="bag-outline" size={24} color={theme.subtext} />
          </View>
        )}
        <View style={[styles.rankBadge, item.rank <= 3 && styles.rankBadgeTop]}>
          <Text style={styles.rankText}>{item.rank}</Text>
        </View>
      </View>
      <View style={styles.vInfo}>
        <Text style={styles.vName} numberOfLines={2}>
          {item.productName}
        </Text>
        <View style={styles.vPriceRow}>
          <Text style={styles.vPrice}>
            {item.productPrice.toLocaleString()}원
          </Text>
          {item.isRocket && <Text style={styles.rocket}>🚀</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderCategory = ({ item: cat }: { item: CategoryBest }) => {
    const isExpanded = expanded.has(cat.categoryId);
    const products = cat.products ?? [];
    const preview = products.slice(0, PREVIEW_COUNT);

    return (
      <View style={styles.catBlock}>
        <View style={styles.catHeader}>
          <Text style={styles.catTitle}>{cat.categoryName}</Text>
          <TouchableOpacity
            onPress={() => toggleExpand(cat.categoryId)}
            hitSlop={6}
            activeOpacity={0.7}
          >
            <Text style={styles.moreText}>
              {isExpanded ? '접기' : '더보기'}
              <Text style={styles.moreArrow}>
                {isExpanded ? ' ▲' : ' ▼'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        {isExpanded ? (
          <View style={styles.expandedList}>
            {products.map(renderExpandedRow)}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {preview.map(renderHorizontalCard)}
            {products.length > PREVIEW_COUNT && (
              <TouchableOpacity
                style={styles.hMoreCard}
                onPress={() => toggleExpand(cat.categoryId)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="chevron-forward-circle"
                  size={28}
                  color={theme.primary}
                />
                <Text style={styles.hMoreText}>
                  더보기{'\n'}({products.length}개)
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>오늘의 BEST</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : categories.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="hourglass-outline" size={56} color={theme.subtext} />
          <Text style={styles.emptyTitle}>준비 중이에요</Text>
          <Text style={styles.emptyDesc}>
            카테고리 베스트 데이터가{'\n'}곧 채워져요
          </Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => String(c.categoryId)}
          renderItem={renderCategory}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            <Text style={styles.affiliateText}>
              이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의
              수수료를 제공받습니다.
            </Text>
          }
        />
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
  listContent: { paddingBottom: 60 },
  catBlock: {
    paddingTop: 18,
    paddingBottom: 6,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  catTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  moreText: {
    color: theme.subtext,
    fontSize: 12,
    fontWeight: '500',
  },
  moreArrow: {
    color: theme.subtext,
    fontSize: 10,
  },
  hScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  hCard: {
    width: 120,
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 8,
    gap: 6,
  },
  imageWrap: {
    position: 'relative',
  },
  hImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
  },
  imagePlaceholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeTop: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  rankText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  hName: {
    color: theme.text,
    fontSize: 12,
    minHeight: 32,
  },
  hPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hPrice: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  rocket: { fontSize: 12 },
  hMoreCard: {
    width: 100,
    backgroundColor: 'rgba(0, 229, 204, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 204, 0.25)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  hMoreText: {
    color: theme.primary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
  expandedList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  vCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 8,
  },
  vImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  vInfo: { flex: 1, gap: 4 },
  vName: { color: theme.text, fontSize: 13 },
  vPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vPrice: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 4,
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
