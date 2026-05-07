import { memo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { TrackedItem } from '../types';
import { SparklineChart } from './SparklineChart';
import { useAppStore } from '../store/useAppStore';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';

interface Props {
  item: TrackedItem;
}

const SWIPE_THRESHOLD = -80;
const DELETE_BTN_WIDTH = 80;

function ProductCardImpl({ item }: Props) {
  const router = useRouter();
  const removeItem = useAppStore((s) => s.removeItem);
  const [showDeleteOverlay, setShowDeleteOverlay] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const {
    isFavorite,
    busy: favoriteBusy,
    enabled: favoriteEnabled,
    toggle: toggleFavorite,
  } = useFavoriteToggle(item);

  const hasTarget = item.targetPrice != null && item.targetPrice > 0;
  const gap =
    item.currentPrice > 0 && hasTarget
      ? Math.round(((item.currentPrice - item.targetPrice!) / item.currentPrice) * 100)
      : 0;

  const isAchieved = item.currentPrice > 0 && hasTarget && item.currentPrice <= item.targetPrice!;

  // Trend 뱃지 — priceHistory 첫값 vs 마지막값 비교 (상세페이지와 동일 정책)
  const trendBadge: { text: string; color: string } | null = (() => {
    if (item.priceHistory.length < 2) return null;
    const first = item.priceHistory[0].price;
    const last = item.priceHistory[item.priceHistory.length - 1].price;
    if (last < first) return { text: '가격하락감지', color: '#FF4444' };
    if (last > first) return { text: '가격상승감지', color: '#3B82F6' };
    return { text: '가격변동없음', color: theme.subtext };
  })();

  const confirmDelete = () => {
    Alert.alert(
      '상품 삭제',
      '이 상품을 삭제하시겠습니까?\n해당 상품의 알림도 자동 중단됩니다.',
      [
        { text: '취소', style: 'cancel', onPress: resetSwipe },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => removeItem(item.id),
        },
      ],
    );
  };

  const resetSwipe = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {
          translateX.setValue(Math.max(gesture.dx, -DELETE_BTN_WIDTH));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < SWIPE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -DELETE_BTN_WIDTH, useNativeDriver: true }).start();
        } else {
          resetSwipe();
        }
      },
    }),
  ).current;

  const handleLongPress = () => {
    setShowDeleteOverlay(true);
  };

  const handlePress = () => {
    if (showDeleteOverlay) {
      setShowDeleteOverlay(false);
    } else {
      router.push(`/detail/${item.id}`);
    }
  };

  return (
    <View style={styles.swipeContainer}>
      {/* 스와이프 뒤 삭제 버튼 */}
      <TouchableOpacity style={styles.swipeDeleteBtn} onPress={confirmDelete} activeOpacity={0.8}>
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={styles.swipeDeleteText}>삭제</Text>
      </TouchableOpacity>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.card}
          onPress={handlePress}
          onLongPress={handleLongPress}
          activeOpacity={0.7}
          delayLongPress={500}
        >
          {/* 길게 누르기 삭제 오버레이 */}
          {showDeleteOverlay && (
            <View style={styles.deleteOverlay}>
              <TouchableOpacity style={styles.deleteOverlayBtn} onPress={confirmDelete} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.deleteOverlayText}>삭제</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 자주사는 토글 (우상단) */}
          {favoriteEnabled && (
            <TouchableOpacity
              style={styles.heartBtn}
              onPress={toggleFavorite}
              disabled={favoriteBusy}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={18}
                color={isFavorite ? '#FF4D6D' : '#ffffff'}
              />
            </TouchableOpacity>
          )}

          <View style={styles.row}>
            {item.thumbnail ? (
              <Image
                source={{ uri: item.thumbnail }}
                style={styles.thumbnailImg}
                cachePolicy="memory-disk"
                recyclingKey={item.id}
                contentFit="cover"
                transition={0}
              />
            ) : (
              <View style={styles.thumbnail}>
                <Ionicons name="bag-handle-outline" size={28} color={theme.subtext} />
              </View>
            )}

            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={2}>
                {item.productName}
              </Text>
              <View style={styles.priceRow}>
                <Text style={styles.currentPrice}>
                  {item.currentPrice.toLocaleString()}원
                </Text>
                {hasTarget && (
                  <Text style={styles.targetPrice}>
                    목표 {item.targetPrice!.toLocaleString()}원
                  </Text>
                )}
              </View>
              <View style={styles.bottomRow}>
                {hasTarget ? (
                  <Text style={[styles.gap, isAchieved && styles.gapAchieved]}>
                    {isAchieved ? '목표 달성!' : `목표까지 -${gap}%`}
                  </Text>
                ) : (
                  <Text style={styles.gap}>가격 추적 중</Text>
                )}
                {trendBadge && (
                  <Text style={[styles.trendBadge, { color: trendBadge.color }]}>
                    {trendBadge.text}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* SparklineChart 내부가 5개 미만이면 null 반환 — chartWrap도 같이 회피 */}
          {item.priceHistory.length >= 5 && (
            <View style={styles.chartWrap}>
              <SparklineChart priceHistory={item.priceHistory} />
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    marginBottom: 12,
    overflow: 'hidden',
    borderRadius: 12,
  },
  swipeDeleteBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BTN_WIDTH,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    gap: 4,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  deleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteOverlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  deleteOverlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  thumbnailImg: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    color: theme.text,
    fontWeight: '600',
    lineHeight: 20,
    paddingRight: 40,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  currentPrice: {
    fontSize: 17,
    fontWeight: 'bold',
    color: theme.text,
  },
  targetPrice: {
    fontSize: 13,
    color: theme.subtext,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  gap: {
    fontSize: 13,
    color: theme.primary,
    fontWeight: '600',
  },
  gapAchieved: {
    color: '#4CAF50',
  },
  trendBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
});

// 불필요한 리렌더 회피 — item 참조가 같으면 스킵 (홈 FlatList 부모 재렌더 시 이득)
export const ProductCard = memo(ProductCardImpl, (prev, next) => prev.item === next.item);
