import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  Modal,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';
import CoupangScraper, { ScrapedProduct } from '../../components/CoupangScraper';
import { getCoupangProductUrl } from '../../services/coupangApi';
import { useFavoriteToggle } from '../../hooks/useFavoriteToggle';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { trackedItems, removeItem, updateItemPrice, markChecked } = useAppStore();

  // 알림 라우팅은 itemId=productId로 보내므로(notifier.ts) productId fallback 매칭 필수.
  // i.id(클라이언트 UUID) 또는 i.productId(쿠팡 상품 ID) 둘 다 허용.
  const item = trackedItems.find((i) => i.id === id || i.productId === id);

  const [refreshing, setRefreshing] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState<string | null>(null);
  const [showAskModal, setShowAskModal] = useState(false);
  const [customAsk, setCustomAsk] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ASK_MESSAGES = [
    '이거 사줘 🙏',
    '나 이거 갖고 싶어 😊',
    '생일선물로 이거 어때요? 🎁',
    '이거 같이 쓰면 좋을 것 같아요! 💕',
    '특가일 때 사주세요! ⚡',
    '이번 기념일 선물로 부탁해 🥺',
  ];

  const {
    isFavorite,
    busy: favoriteBusy,
    enabled: favoriteEnabled,
    toggle: handleToggleFavorite,
  } = useFavoriteToggle(item);

  const handleRefresh = useCallback(() => {
    if (!item || refreshing) return;
    // 1.0.17: resolvedUrl 누락 케이스(아이고 공유상품 등)에서도 productId 기반 vp URL로 동작
    const targetUrl = getCoupangProductUrl(item);
    if (!targetUrl || targetUrl.includes('link.coupang.com')) {
      Alert.alert('새로고침 불가', '이 상품은 자동 새로고침을 지원하지 않습니다');
      return;
    }
    setRefreshing(true);
    setScrapeUrl(targetUrl);
    timeoutRef.current = setTimeout(() => {
      setRefreshing(false);
      setScrapeUrl(null);
    }, 15000);
  }, [item, refreshing]);

  const handleScrapeResult = useCallback((data: ScrapedProduct) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (item) {
      // 1.0.17: 성공/실패/차단 무관하게 시도 시점 마킹 → PriceChecker 6h TTL 가드에 즉시 반영
      markChecked(item.id);
      if (data.price > 0) updateItemPrice(item.id, data.price);
    }
    setRefreshing(false);
    setScrapeUrl(null);
  }, [item, updateItemPrice, markChecked]);

  const handleScrapeError = useCallback((reason?: 'challenge' | 'unknown') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (item) markChecked(item.id);
    if (reason === 'challenge') {
      Alert.alert(
        '쿠팡 봇 차단',
        '쿠팡이 일시적으로 차단 중입니다. 잠시 후 다시 시도해주세요.',
      );
    } else {
      Alert.alert('실패', '가격 정보를 가져올 수 없습니다');
    }
    setRefreshing(false);
    setScrapeUrl(null);
  }, [item, markChecked]);

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>상품을 찾을 수 없습니다</Text>
      </SafeAreaView>
    );
  }

  // 1.0.19 §2 (docs/025) — 가격 상태 머신. 미설정(legacy) 시 'TRACKING'으로 간주.
  const priceStatus = item.priceStatus ?? 'TRACKING';
  const isInit = priceStatus === 'INIT';
  const isSyncing = priceStatus === 'SYNCING';
  const isTracking = priceStatus === 'TRACKING';

  const prices = item.priceHistory.map((p) => p.price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const hasChartData = isTracking && item.priceHistory.length > 1;
  const isAllSamePrice = hasChartData && new Set(prices).size === 1;
  const firstPrice = prices[0] ?? 0;
  const lastPrice = prices[prices.length - 1] ?? 0;

  // 트렌드: TRACKING 상태에서만 의미 있음. INIT/SYNCING은 'flat'로 고정해 변동 텍스트 노출 차단.
  const trend: 'drop' | 'up' | 'flat' =
    !isTracking || !hasChartData || isAllSamePrice || lastPrice === firstPrice
      ? 'flat'
      : lastPrice < firstPrice
        ? 'drop'
        : 'up';
  const CHART_RED = '#FF4444';
  const CHART_BLUE = '#3B82F6';
  const CHART_GREEN = '#22C55E';
  const chartColor =
    trend === 'drop' ? CHART_RED : trend === 'up' ? CHART_BLUE : theme.subtext;

  // 상단 hero용 상태 라벨 + 색. INIT/SYNCING은 변동 텍스트 대신 상태 안내.
  const statusText = isInit
    ? '⏳ 가격 추적 준비 중'
    : isSyncing
      ? '🔄 가격 추적 시작!'
      : trend === 'drop'
        ? '📉 가격 하락 감지'
        : trend === 'up'
          ? '📈 가격 상승 감지'
          : '➡️ 가격 변동 없음';

  // 추적 기간 계산 (일)
  const trackingDays = item.priceHistory.length >= 2
    ? Math.max(1, Math.round(
        (new Date(item.priceHistory[item.priceHistory.length - 1].date).getTime() -
         new Date(item.priceHistory[0].date).getTime()) / 86400000
      ))
    : 0;

  // X축 라벨: 첫날/마지막날 + 중간 2~3개 균등 배치 (priceHistory 길이에 따라 가감)
  const totalPoints = item.priceHistory.length;
  const labelIndices = new Set<number>();
  if (totalPoints > 0) labelIndices.add(0);
  if (totalPoints > 1) labelIndices.add(totalPoints - 1);
  const desiredMidLabels =
    totalPoints >= 8 ? 3 : totalPoints >= 4 ? 2 : totalPoints >= 3 ? 1 : 0;
  for (let k = 1; k <= desiredMidLabels; k++) {
    labelIndices.add(
      Math.round((k * (totalPoints - 1)) / (desiredMidLabels + 1)),
    );
  }

  const chartData = item.priceHistory.map((entry, i) => {
    const dateLabel = labelIndices.has(i)
      ? `${entry.date.slice(5, 7)}/${entry.date.slice(8, 10)}`
      : '';
    return {
      value: entry.price,
      label: dateLabel,
      labelTextStyle: { color: theme.subtext, fontSize: 10 },
      date: entry.date, // pointerLabelComponent tooltip 표기용
    };
  });

  const hasTarget = item.targetPrice != null && item.targetPrice > 0;
  // 최고/최저/목표 참조선이 모두 차트 범위 안에 들어가도록 yAxisOffset/maxValue 보정
  const showMaxMinLines = hasChartData && maxPrice !== minPrice;
  const yMin = hasTarget ? Math.min(minPrice, item.targetPrice!) : minPrice;
  const yMax = hasTarget ? Math.max(maxPrice, item.targetPrice!) : maxPrice;
  const yPad = Math.max(1, Math.round((yMax - yMin) * 0.15));
  const yAxisOffset = Math.max(0, yMin - yPad);
  const maxValue = yMax + yPad - yAxisOffset;

  const createdDate = new Date(item.createdAt);
  const dateStr = `${createdDate.getFullYear()}.${String(createdDate.getMonth() + 1).padStart(2, '0')}.${String(createdDate.getDate()).padStart(2, '0')}`;

  // 가격 하락 여부 (이전 가격 대비) — TRACKING 상태에서만 의미 있음
  const hasPriceDrop = isTracking && item.priceHistory.length >= 2 &&
    item.currentPrice < item.priceHistory[item.priceHistory.length - 2]?.price;

  // 가격 인사이트 메시지 생성 — TRACKING 상태에서만 의미 있음 (INIT/SYNCING은 baseline 단계)
  const priceInsights: { icon: string; text: string; color: string }[] = [];
  if (isTracking && item.priceHistory.length >= 2) {
    // 트렌드 요약 — 그래프 색상과 자동 연동 (drop=red / up=blue / flat=gray)
    if (trend === 'drop') {
      const diff = firstPrice - lastPrice;
      const pct = Math.round((diff / firstPrice) * 100);
      priceInsights.push({
        icon: '📉',
        text: `${trackingDays}일간 ${diff.toLocaleString()}원 하락 (-${pct}%)`,
        color: CHART_RED,
      });
    } else if (trend === 'up') {
      const diff = lastPrice - firstPrice;
      const pct = Math.round((diff / firstPrice) * 100);
      priceInsights.push({
        icon: '📈',
        text: `${trackingDays}일간 ${diff.toLocaleString()}원 상승 (+${pct}%)`,
        color: CHART_BLUE,
      });
    } else {
      // 추적 2일째부터 표시 (priceHistory.length >= 2 + 모두 동일 OR 첫·끝 동일)
      priceInsights.push({
        icon: '➡️',
        text: `최근 ${trackingDays}일간 가격변동 없음`,
        color: theme.subtext,
      });
    }
    // 현재가 = 최저가
    if (item.currentPrice <= minPrice && minPrice !== maxPrice) {
      priceInsights.push({ icon: '🔥', text: `현재가가 ${trackingDays}일간 최저가입니다`, color: '#4CAF50' });
    }
    // 목표가 도달 (목표가 설정된 경우만)
    if (hasTarget && item.currentPrice <= item.targetPrice!) {
      priceInsights.push({ icon: '🎯', text: `목표가(${item.targetPrice!.toLocaleString()}원) 이하입니다`, color: theme.primary });
    }
    // 목표가까지 남은 금액 (목표가 설정된 경우만)
    if (hasTarget && item.currentPrice > item.targetPrice!) {
      const diff = item.currentPrice - item.targetPrice!;
      const pct = Math.round((diff / item.currentPrice) * 100);
      priceInsights.push({ icon: '🎯', text: `목표가까지 ${diff.toLocaleString()}원 (${pct}%) 남음`, color: theme.subtext });
    }
    // 최저가 대비 현재가
    if (item.currentPrice > minPrice) {
      const diff = item.currentPrice - minPrice;
      priceInsights.push({ icon: '💰', text: `${trackingDays}일간 최저가 ${minPrice.toLocaleString()}원 (현재보다 ${diff.toLocaleString()}원 낮음)`, color: theme.subtext });
    }
  }

  const handleShare = async () => {
    const drop = hasPriceDrop
      ? `${item.priceHistory[item.priceHistory.length - 2].price.toLocaleString()}원 → ${item.currentPrice.toLocaleString()}원으로 하락!`
      : `현재 ${item.currentPrice.toLocaleString()}원`;
    const message = `${item.productName}\n${drop}\n\n${item.url}\n\n이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`;
    try {
      await Share.share({ message });
    } catch {}
  };

  const handleSendAsk = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // 입력텍스트\n\n상품명\n링크 (iOS Share UI는 링크 미리보기 카드를 별도 렌더)
    const message = `${trimmed}\n\n${item.productName}\n${item.url}`;
    setShowAskModal(false);
    setCustomAsk('');
    // iOS: Share 시트는 root view를 점유 — 모달 dismiss 애니메이션 끝나기 전 호출 시 시트가 안 뜸.
    // 안드로이드는 즉시 호출해도 무관.
    const delay = Platform.OS === 'ios' ? 350 : 0;
    setTimeout(() => {
      Share.share({ message }).catch(() => {});
    }, delay);
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
            <Image
              source={{ uri: item.thumbnail }}
              style={styles.thumbnailLargeImg}
              cachePolicy="memory-disk"
              recyclingKey={item.id}
              contentFit="cover"
              transition={0}
            />
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

        {/* 현재가 + 상태 hero */}
        <View style={styles.priceHero}>
          <Text
            style={[
              styles.priceHeroValue,
              isInit && { color: theme.subtext },
            ]}
          >
            {item.currentPrice > 0
              ? `${item.currentPrice.toLocaleString()}원${isInit ? ' (예상)' : ''}`
              : '가격 정보 없음'}
          </Text>
          <Text
            style={[
              styles.priceHeroStatus,
              { color: isInit || isSyncing ? theme.primary : chartColor },
            ]}
          >
            {statusText}
          </Text>
        </View>

        {/* Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>가격 변동</Text>
          {isInit ? (
            // 1.0.19 §2 INIT — 첫 realPrice 미수신, 그래프 표시 안 함
            <View style={styles.chartEmpty}>
              <Ionicons name="time-outline" size={32} color={theme.subtext} />
              <Text style={styles.chartEmptyTitle}>가격 추적 준비 중</Text>
              <Text style={styles.chartEmptyDesc}>
                첫 가격 수집 후 그래프가 시작됩니다
              </Text>
            </View>
          ) : isSyncing ? (
            // 1.0.19 §2 SYNCING — 첫 realPrice baseline 단계, 그래프 1점만 의미 있어 텍스트로 안내
            <View style={styles.chartEmpty}>
              <Ionicons name="checkmark-circle-outline" size={32} color={theme.primary} />
              <Text style={styles.chartEmptyTitle}>
                {item.currentPrice > 0
                  ? `현재가 ${item.currentPrice.toLocaleString()}원`
                  : '가격 수집 완료'}
              </Text>
              <Text style={styles.chartEmptyDesc}>
                최저가 도달 시 알림이 시작됩니다
              </Text>
            </View>
          ) : hasChartData ? (
            <View style={styles.chartWrap}>
              <LineChart
                data={chartData}
                width={300}
                height={160}
                color={chartColor}
                thickness={2}
                hideDataPoints={false}
                dataPointsColor={chartColor}
                dataPointsRadius={3}
                hideYAxisText
                hideRules
                yAxisColor="transparent"
                xAxisColor={theme.border}
                xAxisThickness={1}
                isAnimated={false}
                initialSpacing={10}
                endSpacing={10}
                spacing={45}
                scrollToEnd
                scrollAnimation={false}
                yAxisOffset={yAxisOffset}
                maxValue={maxValue}
                startFillColor={chartColor}
                endFillColor="transparent"
                startOpacity={0.15}
                endOpacity={0}
                areaChart
                showReferenceLine1={showMaxMinLines}
                referenceLine1Position={maxPrice}
                referenceLine1Config={{
                  color: CHART_BLUE,
                  dashWidth: 4,
                  dashGap: 4,
                  thickness: 1,
                  labelText: `최고 ${maxPrice.toLocaleString()}원`,
                  labelTextStyle: { color: CHART_BLUE, fontSize: 10, marginTop: -12 },
                }}
                showReferenceLine2={showMaxMinLines}
                referenceLine2Position={minPrice}
                referenceLine2Config={{
                  color: CHART_RED,
                  dashWidth: 4,
                  dashGap: 4,
                  thickness: 1,
                  labelText: `최저 ${minPrice.toLocaleString()}원`,
                  labelTextStyle: { color: CHART_RED, fontSize: 10, marginTop: 4 },
                }}
                showReferenceLine3={hasTarget}
                referenceLine3Position={hasTarget ? item.targetPrice! : 0}
                referenceLine3Config={{
                  color: CHART_GREEN,
                  dashWidth: 4,
                  dashGap: 4,
                  thickness: 1,
                  labelText: hasTarget ? `목표 ${item.targetPrice!.toLocaleString()}원` : '',
                  labelTextStyle: { color: CHART_GREEN, fontSize: 10, marginTop: -12 },
                }}
                pointerConfig={{
                  pointerStripUptoDataPoint: true,
                  pointerStripColor: theme.subtext,
                  pointerStripWidth: 1,
                  showPointerStrip: true,
                  pointerColor: chartColor,
                  radius: 5,
                  pointerLabelWidth: 110,
                  pointerLabelHeight: 44,
                  activatePointersInstantlyOnTouch: true,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items: any[]) => {
                    const it = items?.[0];
                    if (!it) return null;
                    const d: string = it.date ?? '';
                    const dateText = d.length === 10
                      ? `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`
                      : d;
                    return (
                      <View style={styles.tooltip}>
                        <Text style={styles.tooltipDate}>{dateText}</Text>
                        <Text style={styles.tooltipPrice}>
                          {Number(it.value).toLocaleString()}원
                        </Text>
                      </View>
                    );
                  },
                }}
              />
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: chartColor }]} />
                  <Text style={styles.legendText}>
                    {trend === 'drop' ? '하락 추세' : trend === 'up' ? '상승 추세' : '변동 없음'}
                  </Text>
                </View>
                {showMaxMinLines && (
                  <>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDash, { borderColor: CHART_BLUE }]} />
                      <Text style={styles.legendText}>최고가</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDash, { borderColor: CHART_RED }]} />
                      <Text style={styles.legendText}>최저가</Text>
                    </View>
                  </>
                )}
                {hasTarget && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDash, { borderColor: CHART_GREEN }]} />
                    <Text style={styles.legendText}>목표가</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={32} color={theme.subtext} />
              <Text style={styles.chartEmptyTitle}>데이터 축적 중</Text>
              <Text style={styles.chartEmptyDesc}>
                내일부터 가격 변동 그래프가 표시됩니다
              </Text>
            </View>
          )}
        </View>

        {/* Price Insights */}
        {priceInsights.length > 0 && (
          <View style={styles.insightSection}>
            {priceInsights.map((insight, i) => (
              <View key={i} style={styles.insightRow}>
                <Text style={styles.insightIcon}>{insight.icon}</Text>
                <Text style={[styles.insightText, { color: insight.color }]}>{insight.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 사달라고 조르기 */}
        <TouchableOpacity
          style={styles.askButton}
          onPress={() => setShowAskModal(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.askButtonText}>사달라고 조르기 🥺</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.text} />
        </TouchableOpacity>

        <Text style={styles.affiliateText}>
          이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>
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
          {favoriteEnabled && (
            <TouchableOpacity
              style={[styles.iconButton, isFavorite && styles.iconButtonActive]}
              onPress={handleToggleFavorite}
              activeOpacity={0.8}
              disabled={favoriteBusy}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite ? '#FF4D6D' : theme.text}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleShare}
            activeOpacity={0.8}
          >
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 사달라고 조르기 — 멘트 선택 모달 */}
      <Modal visible={showAskModal} transparent animationType="slide">
        <View style={styles.askOverlay}>
          <TouchableOpacity
            style={styles.askBackdrop}
            activeOpacity={1}
            onPress={() => setShowAskModal(false)}
          />
          <View style={styles.askSheet}>
            <View style={styles.askHandle} />
            <Text style={styles.askTitle}>사달라고 조르기 🥺</Text>
            {ASK_MESSAGES.map((msg) => (
              <TouchableOpacity
                key={msg}
                style={styles.askOption}
                onPress={() => handleSendAsk(msg)}
                activeOpacity={0.7}
              >
                <Text style={styles.askOptionText}>{msg}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.askCustomRow}>
              <TextInput
                style={styles.askCustomInput}
                placeholder="직접 입력 ✏️"
                placeholderTextColor={theme.subtext}
                value={customAsk}
                onChangeText={setCustomAsk}
                returnKeyType="send"
                onSubmitEditing={() => handleSendAsk(customAsk)}
              />
              <TouchableOpacity
                style={[
                  styles.askCustomSend,
                  !customAsk.trim() && styles.askCustomSendDisabled,
                ]}
                onPress={() => handleSendAsk(customAsk)}
                disabled={!customAsk.trim()}
                activeOpacity={0.7}
              >
                <Text style={styles.askCustomSendText}>공유</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.askCancel}
              onPress={() => setShowAskModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.askCancelText}>취소</Text>
            </TouchableOpacity>
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
    paddingBottom: 20,
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
  priceHero: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginTop: 8,
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 6,
  },
  priceHeroValue: {
    color: theme.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  priceHeroStatus: {
    fontSize: 13,
    fontWeight: '600',
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
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 14,
    rowGap: 6,
    marginTop: 12,
  },
  tooltip: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    width: 110,
  },
  tooltipDate: {
    color: theme.subtext,
    fontSize: 11,
    marginBottom: 2,
  },
  tooltipPrice: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
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
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    gap: 8,
  },
  chartEmptyTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  chartEmptyDesc: {
    color: theme.subtext,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  insightSection: {
    marginTop: 12,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 10,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightIcon: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  insightText: {
    fontSize: 13,
    flex: 1,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
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
  iconButton: {
    width: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonActive: {
    borderColor: '#FF4D6D',
    backgroundColor: 'rgba(255, 77, 109, 0.08)',
  },
  ctaText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000000',
  },
  affiliateText: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
  },
  // ── 사달라고 조르기 ──
  askButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 105, 180, 0.10)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 105, 180, 0.35)',
  },
  askButtonText: {
    flex: 1,
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  askOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  askBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  askSheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 8,
  },
  askHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    marginBottom: 8,
  },
  askTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  askOption: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: theme.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  askOptionText: {
    color: theme.text,
    fontSize: 15,
  },
  askCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  askCustomInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 15,
  },
  askCustomSend: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.primary,
    borderRadius: 10,
  },
  askCustomSendDisabled: {
    opacity: 0.4,
  },
  askCustomSendText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  askCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  askCancelText: {
    color: theme.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
});
