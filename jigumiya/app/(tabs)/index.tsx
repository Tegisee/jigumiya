import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { ProductCard } from '../../components/ProductCard';
import PriceChecker from '../../components/PriceChecker';
import { TrackedItem } from '../../types';

const MOCK_DATA: TrackedItem[] = [
  {
    id: 'mock-1',
    url: 'https://www.coupang.com/vp/products/7335597913',
    productName: '삼성 갤럭시 버즈3 프로 무선 블루투스 이어폰',
    currentPrice: 259000,
    targetPrice: 199000,
    thumbnail: '',
    priceHistory: [
      { date: '2026-01-28', price: 289000 },
      { date: '2026-02-04', price: 279000 },
      { date: '2026-02-11', price: 269000 },
      { date: '2026-02-18', price: 275000 },
      { date: '2026-02-25', price: 259000 },
      { date: '2026-03-01', price: 265000 },
      { date: '2026-03-03', price: 259000 },
    ],
    createdAt: 1740700800000,
  },
  {
    id: 'mock-2',
    url: 'https://www.coupang.com/vp/products/7942516684',
    productName: '다이슨 에어랩 멀티 스타일러 컴플리트 롱',
    currentPrice: 598000,
    targetPrice: 450000,
    thumbnail: '',
    priceHistory: [
      { date: '2026-01-28', price: 649000 },
      { date: '2026-02-04', price: 629000 },
      { date: '2026-02-11', price: 619000 },
      { date: '2026-02-18', price: 598000 },
      { date: '2026-02-25', price: 609000 },
      { date: '2026-03-01', price: 598000 },
      { date: '2026-03-03', price: 598000 },
    ],
    createdAt: 1740700800000,
  },
  {
    id: 'mock-3',
    url: 'https://www.coupang.com/vp/products/8031756851',
    productName: 'Apple 에어팟 프로 2세대 USB-C',
    currentPrice: 329000,
    targetPrice: 279000,
    thumbnail: '',
    priceHistory: [
      { date: '2026-01-28', price: 359000 },
      { date: '2026-02-04', price: 349000 },
      { date: '2026-02-11', price: 339000 },
      { date: '2026-02-18', price: 329000 },
      { date: '2026-02-25', price: 335000 },
      { date: '2026-03-01', price: 329000 },
      { date: '2026-03-03', price: 329000 },
    ],
    createdAt: 1740700800000,
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { trackedItems, syncFromFirestore } = useAppStore();
  const items = trackedItems.length > 0 ? trackedItems : MOCK_DATA;
  const appStateRef = useRef(AppState.currentState);
  const [checkActive, setCheckActive] = useState(false);
  const lastCheckRef = useRef(0);

  // 앱 포그라운드 복귀 시 가격 체크 (최소 30분 간격)
  useEffect(() => {
    // 앱 최초 로드 시에도 체크
    const now = Date.now();
    if (now - lastCheckRef.current > 30 * 60 * 1000) {
      lastCheckRef.current = now;
      setCheckActive(true);
      setTimeout(() => setCheckActive(false), 60000);
    }

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        syncFromFirestore();
        const elapsed = Date.now() - lastCheckRef.current;
        if (elapsed > 30 * 60 * 1000) {
          lastCheckRef.current = Date.now();
          setCheckActive(true);
          setTimeout(() => setCheckActive(false), 60000);
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [syncFromFirestore]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>지금이야</Text>
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
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/modal/add-item')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* 포그라운드 가격 체크 (Hidden WebView) */}
      <PriceChecker active={checkActive} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
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
