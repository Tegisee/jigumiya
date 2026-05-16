import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import { MAX_TRACKED_ITEMS } from '../../services/config';
import { ProductCard } from '../../components/ProductCard';

/**
 * 추적중 탭 (1.0.17 §앱구조 §4) — 기존 가격변동(price-drops) 탭을 대체.
 * 홈 화면에서 분리된 trackedItems FlatList를 별도 탭으로 노출.
 * 가격은 cron(shared-price-check, 10분 주기)이 갱신 → 동일 store 구독으로 자동 반영.
 */
export default function TrackedScreen() {
  const { trackedItems } = useAppStore();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>추적중</Text>
        <Text style={styles.headerCount}>
          {trackedItems.length} / {MAX_TRACKED_ITEMS}
        </Text>
      </View>

      <FlatList
        data={trackedItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductCard item={item} />}
        contentContainerStyle={styles.list}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="pulse-outline"
              size={56}
              color={theme.subtext}
            />
            <Text style={styles.emptyTitle}>아직 추적 중인 상품이 없어요</Text>
            <Text style={styles.emptyDesc}>
              홈에서 쿠팡 바로가기로 이동한 뒤{'\n'}상품을 공유하면 가격 추적이 시작돼요
            </Text>
          </View>
        }
        ListFooterComponent={
          trackedItems.length > 0 ? (
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
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
  },
  headerCount: {
    fontSize: 14,
    color: theme.subtext,
    fontVariant: ['tabular-nums'],
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
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
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
});
