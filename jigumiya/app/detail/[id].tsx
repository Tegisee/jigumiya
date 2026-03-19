import { useState, useCallback, useRef } from 'react';
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
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import CoupangScraper, { ScrapedProduct } from '../../components/CoupangScraper';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { trackedItems, removeItem, updateTargetPrice, updateItemPrice } = useAppStore();

  const item = trackedItems.find((i) => i.id === id);

  const [showPriceModal, setShowPriceModal] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = useCallback(() => {
    if (!item || refreshing) return;
    setRefreshing(true);
    const targetUrl = item.resolvedUrl || item.url;
    setScrapeUrl(targetUrl);
    timeoutRef.current = setTimeout(() => {
      setRefreshing(false);
      setScrapeUrl(null);
    }, 15000);
  }, [item, refreshing]);

  const handleScrapeResult = useCallback((data: ScrapedProduct) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (item && data.price > 0) {
      updateItemPrice(item.id, data.price);
    }
    setRefreshing(false);
    setScrapeUrl(null);
  }, [item, updateItemPrice]);

  const handleScrapeError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    Alert.alert('실패', '가격 정보를 가져올 수 없습니다');
    setRefreshing(false);
    setScrapeUrl(null);
  }, []);

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
  const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const hasChartData = item.priceHistory.length > 1;
  const isAllSamePrice = hasChartData && new Set(prices).size === 1;

  // 추적 기간 계산 (일)
  const trackingDays = item.priceHistory.length >= 2
    ? Math.max(1, Math.round(
        (new Date(item.priceHistory[item.priceHistory.length - 1].date).getTime() -
         new Date(item.priceHistory[0].date).getTime()) / 86400000
      ))
    : 0;

  const chartData = item.priceHistory.map((entry, i) => {
    const total = item.priceHistory.length;
    const showLabel = i === 0 || i === total - 1 ||
      (total > 4 && i === Math.floor(total / 2));
    const dateLabel = showLabel
      ? `${entry.date.slice(5, 7)}/${entry.date.slice(8, 10)}`
      : '';
    return {
      value: entry.price,
      label: dateLabel,
      labelTextStyle: { color: theme.subtext, fontSize: 10 },
    };
  });

  const targetLineData = item.priceHistory.map(() => ({
    value: item.targetPrice,
  }));

  const createdDate = new Date(item.createdAt);
  const dateStr = `${createdDate.getFullYear()}.${String(createdDate.getMonth() + 1).padStart(2, '0')}.${String(createdDate.getDate()).padStart(2, '0')}`;

  // 가격 하락 여부 (이전 가격 대비)
  const hasPriceDrop = item.priceHistory.length >= 2 &&
    item.currentPrice < item.priceHistory[item.priceHistory.length - 2]?.price;

  const handleShare = async () => {
    const drop = hasPriceDrop
      ? `${item.priceHistory[item.priceHistory.length - 2].price.toLocaleString()}원 → ${item.currentPrice.toLocaleString()}원으로 하락!`
      : `현재 ${item.currentPrice.toLocaleString()}원`;
    const message = `${item.productName}\n${drop}\n\n${item.url}\n\n이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`;
    try {
      await Share.share({ message });
    } catch {}
  };

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
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={handleRefresh}
            style={styles.headerBtn}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="refresh" size={22} color={theme.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={22} color="#FF4444" />
          </TouchableOpacity>
        </View>
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

        {/* 목표가 */}
        <TouchableOpacity
          style={styles.targetRow}
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

        {/* Price Stats */}
        <View style={styles.gridSection}>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>현재가</Text>
              <Text style={styles.gridValue}>
                {item.currentPrice.toLocaleString()}원
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>최저가</Text>
              <Text style={[styles.gridValue, { color: '#4CAF50' }]}>
                {minPrice.toLocaleString()}원
              </Text>
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>최고가</Text>
              <Text style={[styles.gridValue, { color: '#FF4444' }]}>
                {maxPrice.toLocaleString()}원
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>평균가</Text>
              <Text style={styles.gridValue}>
                {avgPrice.toLocaleString()}원
              </Text>
            </View>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>가격 변동</Text>
          {hasChartData ? (
            <View style={styles.chartWrap}>
              <LineChart
                data={chartData}
                data2={targetLineData}
                width={300}
                height={140}
                color={theme.primary}
                color2={theme.primary}
                thickness={2}
                thickness2={1}
                strokeDashArray2={[6, 4]}
                hideDataPoints={false}
                hideDataPoints2
                dataPointsColor={theme.primary}
                dataPointsRadius={3}
                hideYAxisText
                hideRules
                yAxisColor="transparent"
                xAxisColor={theme.border}
                xAxisThickness={1}
                curved
                isAnimated={false}
                initialSpacing={10}
                endSpacing={10}
                spacing={45}
                adjustToWidth
                startFillColor={theme.primary}
                endFillColor="transparent"
                startOpacity={0.15}
                endOpacity={0}
                areaChart
              />
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: theme.primary }]} />
                  <Text style={styles.legendText}>가격</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDash, { borderColor: theme.primary }]} />
                  <Text style={styles.legendText}>목표가 {item.targetPrice.toLocaleString()}원</Text>
                </View>
              </View>
              {isAllSamePrice && (
                <Text style={styles.noChangeText}>
                  최근 {trackingDays}일간 가격변동이 없었습니다
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartSinglePrice}>
                {item.currentPrice > 0
                  ? `${item.currentPrice.toLocaleString()}원`
                  : '가격 정보 없음'}
              </Text>
              <Text style={styles.chartEmptySubtext}>
                매일 3회 가격을 확인합니다 (08시/14시/21시)
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => Linking.openURL(item.url)}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaText}>지금 구매하기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShare}
            activeOpacity={0.8}
          >
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
        <Text style={styles.affiliateText}>
          이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>
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

      {/* Hidden WebView — 수동 가격 새로고침 */}
      <CoupangScraper
        url={scrapeUrl}
        onResult={handleScrapeResult}
        onError={handleScrapeError}
      />
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  targetRow: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 8,
  },
  gridSection: {
    gap: 10,
    marginTop: 10,
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
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  legendDash: {
    width: 16,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 11,
    color: theme.subtext,
  },
  chartEmpty: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 32,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    gap: 8,
  },
  chartSinglePrice: {
    color: theme.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  chartEmptySubtext: {
    color: theme.subtext,
    fontSize: 12,
    marginTop: 4,
  },
  noChangeText: {
    color: theme.subtext,
    fontSize: 12,
    marginTop: 10,
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
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ctaButton: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareButton: {
    width: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000000',
  },
  affiliateText: {
    color: theme.subtext,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.6,
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
