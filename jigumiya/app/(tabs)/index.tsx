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
import PriceChecker from '../../components/PriceChecker';
import { fetchGoldbox, hasCoupangApiKeys, type GoldboxProduct } from '../../services/coupangApi';

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

    // 골드박스 로드
    if (hasCoupangApiKeys()) {
      fetchGoldbox().then(setGoldbox).catch(() => {});
    }

    return () => sub.remove();
  }, [syncFromFirestore]);

  const handleShareWishlist = async () => {
    if (items.length === 0) return;
    const lines = items.map((item, i) =>
      `${i + 1}. ${item.productName}\n   ${item.currentPrice.toLocaleString()}원 (목표 ${item.targetPrice.toLocaleString()}원)\n   ${item.url}`
    );
    const message = `내 위시리스트\n\n${lines.join('\n\n')}\n\n이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`;
    try {
      await Share.share({ message });
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
          <Ionicons name="bag-outline" size={20} color={theme.subtext} />
        </View>
      )}
      <Text style={styles.goldboxName} numberOfLines={2}>{product.productName}</Text>
      <Text style={styles.goldboxPrice}>{product.productPrice.toLocaleString()}원</Text>
      {product.isRocket && (
        <Text style={styles.goldboxRocket}>로켓배송</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>지금이야</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleShareWishlist} style={styles.shareBtn}>
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard item={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          goldbox.length > 0 ? (
            <View style={styles.goldboxSection}>
              <View style={styles.goldboxHeader}>
                <Ionicons name="flash" size={18} color="#FFD700" />
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
          ) : null
        }
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
    color: theme.subtext,
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    opacity: 0.6,
  },

  // ── 골드박스 ──
  goldboxSection: {
    marginBottom: 20,
  },
  goldboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  goldboxTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.text,
  },
  goldboxScroll: {
    gap: 10,
  },
  goldboxCard: {
    width: 130,
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
  },
  goldboxImage: {
    width: 110,
    height: 110,
    borderRadius: 8,
    marginBottom: 8,
  },
  goldboxImagePlaceholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldboxName: {
    color: theme.text,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  goldboxPrice: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  goldboxRocket: {
    color: '#4A90D9',
    fontSize: 10,
    marginTop: 2,
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
