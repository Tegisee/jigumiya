import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { ProductCard } from '../../components/ProductCard';
import PriceChecker from '../../components/PriceChecker';

export default function HomeScreen() {
  const router = useRouter();
  const { trackedItems, syncFromFirestore } = useAppStore();
  const items = trackedItems;
  const appStateRef = useRef(AppState.currentState);
  const [checkActive, setCheckActive] = useState(false);
  const lastCheckRef = useRef(0);

  // 앱 최초 로드 시 1회만 가격 체크 (foreground 복귀 시 재실행 안 함)
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
  affiliateText: {
    color: theme.subtext,
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    opacity: 0.6,
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
