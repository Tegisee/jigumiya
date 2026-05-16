import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { fetchAdminStats, type AdminStats } from '../services/firebase';

/**
 * 1.0.20 (docs/026 #5): 관리자 통계 대시보드.
 * 4섹션: 추적상품수 / 가격변동 / 알림발송 / 사용자수.
 * meta/notif_stats는 cron 발송 누적 대기 — 현재 없으면 graceful "데이터 없음" 표시.
 */
export default function AdminScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetchAdminStats();
      setStats(s);
    } catch (e) {
      console.warn('[admin] fetchAdminStats 실패:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
          <Text style={styles.headerBtnText}>설정</Text>
        </TouchableOpacity>
        <Text style={styles.title}>관리자 통계</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : !stats ? (
        <View style={styles.loadingBox}>
          <Ionicons name="alert-circle-outline" size={32} color={theme.subtext} />
          <Text style={styles.errorText}>통계 조회 실패</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          {/* 1. 추적상품수 */}
          <Section
            icon="cube-outline"
            title="추적상품"
            color={theme.primary}
          >
            <Row label="전체 등록" value={`${stats.productStats.total}개`} />
            <Row
              label="추적자 보유"
              value={`${stats.productStats.withTrackers}개`}
              hint={`(${pctText(stats.productStats.withTrackers, stats.productStats.total)})`}
            />
            <Row
              label="평균 추적자수"
              value={stats.productStats.avgTrackers.toFixed(1)}
            />
          </Section>

          {/* 2. 가격변동 */}
          <Section icon="trending-down" title="가격변동 (24h)" color="#FF6B6B">
            <Row label="가격 하락 건수" value={`${stats.priceStats.drops24h}건`} />
            <Row
              label="평균 하락률"
              value={
                stats.priceStats.drops24h > 0
                  ? `${stats.priceStats.avgDropRate.toFixed(1)}%`
                  : '—'
              }
            />
          </Section>

          {/* 3. 알림발송 */}
          <Section icon="notifications-outline" title="알림발송" color="#FFB02E">
            {stats.notifStats.available ? (
              <>
                <Row
                  label="오늘 발송"
                  value={`${stats.notifStats.sentToday ?? 0}건`}
                />
                <Row
                  label="이번 주 발송"
                  value={`${stats.notifStats.sentThisWeek ?? 0}건`}
                />
                <Row
                  label="마지막 발송"
                  value={formatRelative(stats.notifStats.lastSentAt)}
                />
              </>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  데이터 없음 — cron 발송 누적 대기 중
                </Text>
                <Text style={styles.emptyHint}>
                  meta/notif_stats 문서가 생성되면 자동 표시됩니다
                </Text>
              </View>
            )}
          </Section>

          {/* 4. 사용자수 */}
          <Section icon="people-outline" title="사용자" color="#22C55E">
            <Row label="전체" value={`${stats.userStats.total}명`} />
            <Row
              label="7일 이내 활동"
              value={`${stats.userStats.active7d}명`}
              hint={`(${pctText(stats.userStats.active7d, stats.userStats.total)})`}
            />
            <Row
              label="푸시 토큰 보유"
              value={`${stats.userStats.withToken}명`}
              hint={`(${pctText(stats.userStats.withToken, stats.userStats.total)})`}
            />
          </Section>

          {/* cron 메타 (footer) */}
          <View style={styles.footer}>
            <Text style={styles.footerLabel}>
              cron 마지막 실행: {formatRelative(stats.cronStats.lastRunAt)}
            </Text>
            {typeof stats.cronStats.lastCheckedOffset === 'number' && (
              <Text style={styles.footerLabel}>
                split offset: {stats.cronStats.lastCheckedOffset}
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

interface SectionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  color: string;
  children: React.ReactNode;
}
function Section({ icon, title, color, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
    </View>
  );
}

function pctText(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function formatRelative(ts?: number): string {
  if (!ts || ts <= 0) return '—';
  const diff = Date.now() - ts;
  if (diff < 0) return '방금';
  if (diff < 60_000) return '방금';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
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
  title: {
    flex: 1,
    color: theme.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    color: theme.subtext,
    fontSize: 14,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.primary,
  },
  retryText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  section: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionBody: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: {
    color: theme.subtext,
    fontSize: 13,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  rowValue: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    color: theme.subtext,
    fontSize: 11,
  },
  emptyBox: {
    paddingVertical: 8,
    gap: 4,
  },
  emptyText: {
    color: theme.subtext,
    fontSize: 13,
  },
  emptyHint: {
    color: theme.subtext,
    fontSize: 11,
  },
  footer: {
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  footerLabel: {
    color: theme.subtext,
    fontSize: 11,
  },
});
