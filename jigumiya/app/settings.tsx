import { View, Text, Switch, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';

const appVersion = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const router = useRouter();
  const {
    notificationEnabled,
    toggleNotification,
    resetAllData,
  } = useAppStore();

  const handleReset = () => {
    Alert.alert(
      '전체 데이터 초기화',
      '등록된 모든 상품과 설정이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: () => {
            resetAllData();
            Alert.alert('완료', '모든 데이터가 초기화되었습니다.');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>설정</Text>
        <View style={styles.headerRight} />
      </View>

      <Text style={styles.sectionTitle}>알림</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="notifications-outline" size={20} color={theme.primary} />
            <View style={styles.rowText}>
              <Text style={styles.label}>가격 알림</Text>
              <Text style={styles.desc}>가격 하락 시 푸시 알림 받기</Text>
            </View>
          </View>
          <Switch
            value={notificationEnabled}
            onValueChange={toggleNotification}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={theme.text}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>정보</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push('/modal/privacy')}
          activeOpacity={0.6}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="document-text-outline" size={20} color={theme.subtext} />
            <Text style={styles.label}>개인정보처리방침</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="information-circle-outline" size={20} color={theme.subtext} />
            <Text style={styles.label}>버전</Text>
          </View>
          <Text style={styles.versionText}>{appVersion}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>데이터</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={handleReset}
          activeOpacity={0.6}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="trash-outline" size={20} color="#FF4444" />
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: '#FF4444' }]}>전체 데이터 초기화</Text>
              <Text style={styles.desc}>모든 상품 및 설정 삭제</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      <Text style={styles.affiliate}>
        이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 24,
  },
  backBtn: {
    padding: 4,
  },
  headerRight: {
    width: 34,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.subtext,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 24,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    gap: 2,
  },
  label: {
    fontSize: 16,
    color: theme.text,
    fontWeight: '500',
  },
  desc: {
    fontSize: 13,
    color: theme.subtext,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginHorizontal: 16,
  },
  versionText: {
    fontSize: 15,
    color: theme.subtext,
  },
  affiliate: {
    fontSize: 11,
    color: theme.subtext,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.6,
  },
});
