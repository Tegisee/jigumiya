import { useEffect, useState } from 'react';
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
import { theme } from '../../constants/theme';
import { fetchAllCategoryBest } from '../../services/firebase';
import { generateDeepLink } from '../../services/coupangApi';
import type { CategoryBest, BestProductItem } from '../../types';

export default function FeedScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryBest[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchAllCategoryBest();
      if (cancelled) return;
      setCategories(data);
      setSelectedId(data[0]?.categoryId ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCategory = categories.find((c) => c.categoryId === selectedId);
  const products = selectedCategory?.products ?? [];

  const handleBuy = async (item: BestProductItem) => {
    try {
      const deepLink = await generateDeepLink(item.productUrl);
      if (deepLink?.shortenUrl) {
        Linking.openURL(deepLink.shortenUrl);
        return;
      }
    } catch {}
    try {
      Linking.openURL(item.productUrl);
    } catch {}
  };

  const renderProduct = ({ item }: { item: BestProductItem }) => (
    <TouchableOpacity
      style={styles.cardInner}
      onPress={() => handleBuy(item)}
      activeOpacity={0.8}
    >
      <View style={styles.imageWrap}>
        {item.productImage ? (
          <Image source={{ uri: item.productImage }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="bag-outline" size={28} color={theme.subtext} />
          </View>
        )}
        <View
          style={[
            styles.rankBadge,
            item.rank <= 3 && styles.rankBadgeTop,
          ]}
        >
          <Text style={styles.rankText}>{item.rank}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {item.productName}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {item.productPrice.toLocaleString()}원
          </Text>
          {item.isRocket && <Text style={styles.rocket}>🚀</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>카테고리 베스트</Text>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={styles.settingsBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={theme.text} />
        </TouchableOpacity>
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
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContainer}
          >
            {categories.map((cat) => {
              const active = cat.categoryId === selectedId;
              return (
                <TouchableOpacity
                  key={cat.categoryId}
                  onPress={() => setSelectedId(cat.categoryId)}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {cat.categoryName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <FlatList
            data={products}
            keyExtractor={(item) => `${item.rank}-${item.productId}`}
            renderItem={renderProduct}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyDesc}>
                  이 카테고리는 아직 데이터가 없어요
                </Text>
              </View>
            }
            ListFooterComponent={
              products.length > 0 ? (
                <Text style={styles.affiliateText}>
                  이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의
                  수수료를 제공받습니다.
                </Text>
              ) : null
            }
          />
        </>
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
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
  },
  settingsBtn: {
    padding: 6,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipText: {
    color: theme.subtext,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
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
  imageWrap: {
    width: 64,
    height: 64,
    position: 'relative',
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
    gap: 6,
  },
  price: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  rocket: {
    fontSize: 13,
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
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
});
