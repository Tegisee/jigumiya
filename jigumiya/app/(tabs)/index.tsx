import { useEffect, useRef, useState, useCallback } from 'react';
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
import { fetchGoldbox, hasCoupangApiKeys, type GoldboxProduct } from '../../services/coupangApi';
import { getAppShareMessage } from '../../services/config';

export default function HomeScreen() {
  const router = useRouter();
  const { trackedItems, syncFromFirestore } = useAppStore();
  const items = trackedItems;
  const appStateRef = useRef(AppState.currentState);
  const [checkActive, setCheckActive] = useState(false);
  const lastCheckRef = useRef(0);
  const [goldbox, setGoldbox] = useState<GoldboxProduct[]>([]);

  useEffect(() => {
    if (lastCheckRef.current === 0) {
      lastCheckRef.current = Date.now();
      setCheckActive(true);
      setTimeout(() => setCheckActive(false), 120000);
    }

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        syncFromFirestore();
      }
      appStateRef.current = nextState;
    });

    // 골드박스 로드 (캐시 우선 → API 갱신)
    AsyncStorage.getItem('goldbox-cache').then((cached) => {
      if (cached) {
        try { setGoldbox(JSON.parse(cached)); } catch {}
      }
    });
    if (hasCoupangApiKeys()) {
      fetchGoldbox().then((data) => {
        if (data.length > 0) {
          setGoldbox(data);
          AsyncStorage.setItem('goldbox-cache', JSON.stringify(data)).catch(() => {});
        }
      }).catch(() => {});
    }

    return () => sub.remove();
  }, [syncFromFirestore]);

  const handleShareApp = async () => {
    try {
      await Share.share({ message: getAppShareMessage() });
    } catch {}
  };

  const renderGoldboxItem = (product: GoldboxProduct) => (
    <TouchableOpacity
      key={product.productId}
      style={styles.goldboxCard}
      onPress={() => Linking.openURL(product.productUrl)}
      activeOpacity={0.8}
    >
      {product.productImage ? (
        <Image source={{ uri: product.productImage }} style={styles.goldboxImage} />
      ) : (
        <View style={[styles.goldboxImage, styles.goldboxImagePlaceholder]}>
          <Ionicons name="bag-outline" size={16} color={theme.subtext} />
        </View>
      )}
      <View style={styles.goldboxInfo}>
        <Text style={styles.goldboxName} numberOfLines={1}>{product.productName}</Text>
        <Text style={styles.goldboxPrice}>{product.productPrice.toLocaleString()}원</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>지금이야</Text>
        <TouchableOpacity onPress={handleShareApp} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* 골드박스 상단 고정 */}
      {goldbox.length > 0 && (
        <View style={styles.goldboxSection}>
          <View style={styles.goldboxHeader}>
            <Ionicons name="flash" size={14} color="#FFD700" />
            <Text style={styles.goldboxTitle}>오늘의 특가</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.goldboxScroll}
          >
            {goldbox.map(renderGoldboxItem)}
          </ScrollView>
        </View>
      )}

      {/* 추적상품 가져오기 */}
      <TouchableOpacity
        style={styles.fetchBtn}
        onPress={() => Linking.openURL('https://www.coupang.com')}
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

  // ── 골드박스 (상단 고정, 컴팩트) ──
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
