import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../../constants/theme';
import {
  subscribeAuthUid,
  subscribeFavorites,
  getSharedProduct,
  removeFavoriteRef,
  incrementFavoriteCount,
} from '../../services/firebase';
import { generateDeepLink } from '../../services/coupangApi';
import type { FavoriteRef, SharedProduct } from '../../types';

type MetadataState = SharedProduct | null; // null = 조회 완료 but 부재 / undefined = 미조회

export default function FavoritesScreen() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoriteRef[]>([]);
  const [metadata, setMetadata] = useState<Record<string, MetadataState>>({});
  const [loading, setLoading] = useState(true);
  const loadedIdsRef = useRef(new Set<string>());

  // Auth uid 구독
  useEffect(() => {
    const unsub = subscribeAuthUid((next) => setUid(next));
    return unsub;
  }, []);

  // favorites 실시간 구독 (uid 준비되면 시작)
  useEffect(() => {
    if (!uid) {
      setFavorites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeFavorites(uid, (refs) => {
      setFavorites(refs);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  // favorites 변경 시 누락된 shared_products 메타데이터 배치 조회
  useEffect(() => {
    const missing = favorites.filter(
      (f) => !loadedIdsRef.current.has(f.productId),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missing.map((f) =>
          getSharedProduct(f.productId).then(
            (sp) => [f.productId, sp] as const,
          ),
        ),
      );
      if (cancelled) return;
      for (const [pid] of results) loadedIdsRef.current.add(pid);
      setMetadata((prev) => {
        const next = { ...prev };
        for (const [pid, sp] of results) next[pid] = sp;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  const handleRemove = (productId: string) => {
    Alert.alert('자주 사는 상품 삭제', '이 상품을 목록에서 제거할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!uid) return;
          await removeFavoriteRef(uid, productId);
          await incrementFavoriteCount(productId, -1);
        },
      },
    ]);
  };

  const handleBuy = async (product: SharedProduct) => {
    const targetUrl = product.resolvedUrl || product.url;
    try {
      const deepLink = await generateDeepLink(targetUrl);
      if (deepLink?.shortenUrl) {
        Linking.openURL(deepLink.shortenUrl);
        return;
      }
    } catch {}
    try {
      Linking.openURL(targetUrl);
    } catch {}
  };

  const renderItem = ({ item }: { item: FavoriteRef }) => {
    const product = metadata[item.productId];

    // 로딩 중 (메타데이터 아직 조회 전)
    if (product === undefined) {
      return (
        <View style={styles.card}>
          <View style={[styles.image, styles.imagePlaceholder]} />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              불러오는 중...
            </Text>
          </View>
        </View>
      );
    }

    // 메타데이터 없음 (shared_products 미생성 상태)
    if (product === null) {
      return (
        <View style={styles.card}>
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons
              name="help-circle-outline"
              size={28}
              color={theme.subtext}
            />
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>정보 없음</Text>
            <Text style={styles.desc}>상품 정보가 아직 준비되지 않았어요</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleRemove(item.productId)}
            style={styles.deleteBtn}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={22} color={theme.subtext} />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleBuy(product)}
        activeOpacity={0.8}
      >
        {product.thumbnail ? (
          <Image source={{ uri: product.thumbnail }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="bag-outline" size={28} color={theme.subtext} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {product.productName}
          </Text>
          <Text style={styles.price}>
            {product.currentPrice
              ? `${product.currentPrice.toLocaleString()}원`
              : '가격 정보 없음'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleRemove(item.productId)}
          style={styles.deleteBtn}
          hitSlop={10}
        >
          <Ionicons name="close-circle" size={22} color={theme.subtext} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>자주 사는 상품</Text>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={styles.settingsBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={favorites}
        keyExtractor={(item) => item.productId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons
                name="heart-outline"
                size={56}
                color={theme.subtext}
              />
              <Text style={styles.emptyTitle}>자주 사는 상품이 없어요</Text>
              <Text style={styles.emptyDesc}>
                가격 변동 피드나 상품 상세 화면에서{'\n'}
                자주 구매하는 상품을 여기에 추가할 수 있어요
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          favorites.length > 0 ? (
            <Text style={styles.affiliateText}>
              이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
            </Text>
          ) : null
        }
      />
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
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
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '500',
  },
  desc: {
    color: theme.subtext,
    fontSize: 12,
  },
  price: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: 40,
    gap: 12,
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
