import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../../constants/theme';

export default function FeedScreen() {
  const router = useRouter();

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

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.banner}>
          <View style={styles.iconWrap}>
            <Ionicons
              name="trending-down-outline"
              size={48}
              color={theme.primary}
            />
          </View>
          <Text style={styles.bannerTitle}>곧 출시될 기능이에요</Text>
          <Text style={styles.bannerDesc}>
            전체 사용자가 추적 중인 상품의{'\n'}
            가격 하락 소식을 실시간으로 받아볼 수 있어요
          </Text>
          <View style={styles.hint}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={theme.subtext}
            />
            <Text style={styles.hintText}>Phase 3 후속 업데이트에서 공개</Text>
          </View>
        </View>
      </ScrollView>
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
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  banner: {
    alignItems: 'center',
    gap: 16,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0, 229, 204, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 204, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTitle: {
    color: theme.text,
    fontSize: 19,
    fontWeight: '700',
  },
  bannerDesc: {
    color: theme.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 4,
  },
  hintText: {
    color: theme.subtext,
    fontSize: 12,
  },
});
