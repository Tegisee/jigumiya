import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../../constants/theme';
import { subscribePriceDrops } from '../../services/firebase';
import type { PriceDrop } from '../../types';

export default function FeedScreen() {
  const router = useRouter();
  const [drops, setDrops] = useState<PriceDrop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribePriceDrops((next) => {
      setDrops(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  const renderItem = ({ item }: { item: PriceDrop }) => (
    <View style={styles.card}>
      {item.thumbnail ? (
        <Image source={{ uri: item.thumbnail }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Ionicons name="bag-outline" size={28} color={theme.subtext} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {item.productName}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.prevPrice}>
            {item.prevPrice.toLocaleString()}원
          </Text>
          <Ionicons name="arrow-forward" size={12} color={theme.subtext} />
          <Text style={styles.currentPrice}>
            {item.currentPrice.toLocaleString()}원
          </Text>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.dropBadge}>
            <Text style={styles.dropText}>
              {item.dropRate.toFixed(1)}%
            </Text>
          </View>
          {item.trackerCount > 0 && (
            <Text style={styles.trackerCount}>
              🔥 {item.trackerCount.toLocaleString()}명 추적 중
            </Text>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>가격 변동</Text>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={styles.settingsBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={drops}
        keyExtractor={(item, idx) => `${item.productId}-${idx}`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons
                name="trending-down-outline"
                size={56}
                color={theme.subtext}
              />
              <Text style={styles.emptyTitle}>
                곧 가격 변동 정보가 들어와요
              </Text>
              <Text style={styles.emptyDesc}>
                전체 사용자가 추적 중인 상품의{'\n'}
                가격 하락 소식이 여기에 실시간으로 표시돼요
              </Text>
              <View style={styles.emptyHint}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={theme.subtext}
                />
                <Text style={styles.emptyHintText}>
                  준비 중인 기능입니다
                </Text>
              </View>
            </View>
          )
        }
        ListFooterComponent={
          drops.length > 0 ? (
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
  },
  settingsBtn: {
    padding: 6,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  imagePlaceholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prevPrice: {
    color: theme.subtext,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  currentPrice: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  dropBadge: {
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dropText: {
    color: '#FF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  trackerCount: {
    color: theme.subtext,
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyDesc: {
    color: theme.subtext,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  emptyHintText: {
    color: theme.subtext,
    fontSize: 12,
  },
  affiliateText: {
    color: '#888888',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
});
