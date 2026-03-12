import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
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

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { trackedItems, removeItem, updateTargetPrice } = useAppStore();

  const allItems = trackedItems.length > 0 ? trackedItems : MOCK_DATA;
  const item = allItems.find((i) => i.id === id);

  const [showPriceModal, setShowPriceModal] = useState(false);
  const [newPrice, setNewPrice] = useState('');

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>상품을 찾을 수 없습니다</Text>
      </SafeAreaView>
    );
  }

  const prices = item.priceHistory.map((p) => p.price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const chartData = item.priceHistory.map((p) => ({ value: p.price }));

  const createdDate = new Date(item.createdAt);
  const dateStr = `${createdDate.getFullYear()}.${String(createdDate.getMonth() + 1).padStart(2, '0')}.${String(createdDate.getDate()).padStart(2, '0')}`;

  const handleDelete = () => {
    Alert.alert('상품 삭제', '이 상품을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          removeItem(item.id);
          router.back();
        },
      },
    ]);
  };

  const handleUpdatePrice = () => {
    const price = parseInt(newPrice, 10);
    if (!price || price <= 0) {
      Alert.alert('오류', '올바른 가격을 입력해주세요');
      return;
    }
    updateTargetPrice(item.id, price);
    setShowPriceModal(false);
    setNewPrice('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
          <Text style={styles.headerBtnText}>홈</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
          <Ionicons name="trash-outline" size={22} color="#FF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Product Info */}
        <View style={styles.productSection}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.thumbnailLargeImg} />
          ) : (
            <View style={styles.thumbnailLarge}>
              <Ionicons name="bag-handle-outline" size={48} color={theme.subtext} />
            </View>
          )}
          <Text style={styles.productName}>{item.productName}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>쿠팡</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>등록일 {dateStr}</Text>
          </View>
        </View>

        {/* Price Grid 2x2 */}
        <View style={styles.gridSection}>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>현재가</Text>
              <Text style={styles.gridValue}>
                {item.currentPrice.toLocaleString()}원
              </Text>
            </View>
            <TouchableOpacity
              style={styles.gridItem}
              onPress={() => {
                setNewPrice(String(item.targetPrice));
                setShowPriceModal(true);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.gridLabelRow}>
                <Text style={styles.gridLabel}>목표가</Text>
                <Ionicons name="pencil" size={12} color={theme.subtext} />
              </View>
              <Text style={[styles.gridValue, { color: theme.primary }]}>
                {item.targetPrice.toLocaleString()}원
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>30일 최고가</Text>
              <Text style={styles.gridValue}>
                {maxPrice.toLocaleString()}원
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>30일 최저가</Text>
              <Text style={styles.gridValue}>
                {minPrice.toLocaleString()}원
              </Text>
            </View>
          </View>
        </View>

        {/* Chart */}
        {chartData.length > 1 && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>30일 가격 변동</Text>
            <View style={styles.chartWrap}>
              <LineChart
                data={chartData}
                width={300}
                height={120}
                color={theme.primary}
                thickness={2}
                hideDataPoints={false}
                dataPointsColor={theme.primary}
                dataPointsRadius={3}
                hideYAxisText
                hideRules
                yAxisColor="transparent"
                xAxisColor="transparent"
                curved
                isAnimated={false}
                initialSpacing={10}
                endSpacing={10}
                spacing={45}
                adjustToWidth
                startFillColor={theme.primary}
                endFillColor="transparent"
                startOpacity={0.2}
                endOpacity={0}
                areaChart
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => Linking.openURL(item.url)}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>지금 구매하기</Text>
        </TouchableOpacity>
      </View>

      {/* Target Price Edit Modal */}
      <Modal visible={showPriceModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>목표가 수정</Text>
            <TextInput
              style={styles.modalInput}
              value={newPrice}
              onChangeText={setNewPrice}
              keyboardType="number-pad"
              placeholder="목표 가격 입력"
              placeholderTextColor={theme.subtext}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowPriceModal(false);
                  setNewPrice('');
                }}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleUpdatePrice}
              >
                <Text style={styles.modalConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  errorText: {
    color: theme.subtext,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  headerBtnText: {
    color: theme.text,
    fontSize: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  productSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  thumbnailLarge: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: theme.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  thumbnailLargeImg: {
    width: 96,
    height: 96,
    borderRadius: 16,
    marginBottom: 16,
  },
  productName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.text,
    textAlign: 'center',
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    color: theme.subtext,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.subtext,
  },
  gridSection: {
    gap: 10,
    marginTop: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridItem: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  gridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridLabel: {
    fontSize: 12,
    color: theme.subtext,
    marginBottom: 6,
  },
  gridValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.text,
  },
  chartSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 12,
  },
  chartWrap: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    overflow: 'hidden',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  ctaButton: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 24,
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: theme.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: theme.subtext,
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '600',
  },
});
