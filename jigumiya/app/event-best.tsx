import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '../constants/theme';
import { fetchEventBySlug } from '../services/firebase';
import type { EventBestJigumiya, EventBestJigumiyaProduct } from '../types';

export default function EventBestScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [doc, setDoc] = useState<EventBestJigumiya | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) {
        if (!cancelled) setDoc(null);
        return;
      }
      const result = await fetchEventBySlug(slug);
      if (!cancelled) setDoc(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 오늘 KST 기준 D-N 계산 (배너와 동일 로직)
  const dLabel = useMemo(() => {
    if (!doc?.date) return '';
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayY = kst.getUTCFullYear();
    const todayMid = Date.UTC(todayY, kst.getUTCMonth(), kst.getUTCDate());
    const [mm, dd] = doc.date.split('-').map(Number);
    if (!mm || !dd) return '';
    let evMid = Date.UTC(todayY, mm - 1, dd);
    let diff = Math.round((evMid - todayMid) / 86400000);
    if (diff < 0) {
      evMid = Date.UTC(todayY + 1, mm - 1, dd);
      diff = Math.round((evMid - todayMid) / 86400000);
    }
    return diff === 0 ? 'D-day' : `D-${diff}`;
  }, [doc?.date]);

  const handleBuy = (item: EventBestJigumiyaProduct) => {
    if (!item.deepLink) return;
    try {
      Linking.openURL(item.deepLink);
    } catch {}
  };

  const renderItem = ({ item }: { item: EventBestJigumiyaProduct }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleBuy(item)}
      activeOpacity={0.8}
    >
      {item.productImage ? (
        <Image
          source={{ uri: item.productImage }}
          style={styles.image}
          cachePolicy="memory-disk"
          recyclingKey={item.productId}
          contentFit="cover"
          transition={0}
        />
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
          <Text style={styles.price}>
            {item.productPrice.toLocaleString()}원
          </Text>
          {item.isRocket && <Text style={styles.rocket}>🚀</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {doc?.eventName ?? '이벤트'}
          </Text>
          {!!dLabel && <Text style={styles.headerDLabel}>{dLabel}</Text>}
        </View>
        <View style={{ width: 32 }} />
      </View>

      {doc === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : !doc || !doc.products?.length ? (
        <View style={styles.center}>
          <Ionicons name="hourglass-outline" size={56} color={theme.subtext} />
          <Text style={styles.emptyTitle}>준비 중이에요</Text>
          <Text style={styles.emptyDesc}>
            이벤트 상품 데이터가{'\n'}곧 채워져요
          </Text>
        </View>
      ) : (
        <FlatList
          data={doc.products}
          keyExtractor={(p) => p.productId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          ListFooterComponent={
            <Text style={styles.affiliateText}>
              이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를
              제공받습니다.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: { padding: 4 },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerDLabel: {
    color: '#FF69B4',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 60,
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
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  imagePlaceholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, gap: 4 },
  name: { color: theme.text, fontSize: 14, fontWeight: '500' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  price: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  rocket: { fontSize: 13 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 17,
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
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
});
