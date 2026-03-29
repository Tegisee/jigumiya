import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { TrackedItem } from '../types';
import { SparklineChart } from './SparklineChart';

interface Props {
  item: TrackedItem;
}

export function ProductCard({ item }: Props) {
  const router = useRouter();
  const hasTarget = item.targetPrice != null && item.targetPrice > 0;
  const gap =
    item.currentPrice > 0 && hasTarget
      ? Math.round(((item.currentPrice - item.targetPrice!) / item.currentPrice) * 100)
      : 0;

  const isAchieved = item.currentPrice > 0 && hasTarget && item.currentPrice <= item.targetPrice!;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/detail/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImg} />
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
          {hasTarget ? (
            <Text style={[styles.gap, isAchieved && styles.gapAchieved]}>
              {isAchieved ? '목표 달성!' : `목표까지 -${gap}%`}
            </Text>
          ) : (
            <Text style={styles.gap}>가격 추적 중</Text>
          )}
        </View>
      </View>

      {item.priceHistory.length > 1 && (
        <View style={styles.chartWrap}>
          <SparklineChart priceHistory={item.priceHistory} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
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
  gap: {
    fontSize: 13,
    color: theme.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  gapAchieved: {
    color: '#4CAF50',
  },
  chartWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
});
