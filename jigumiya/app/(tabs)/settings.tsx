import { View, Text, Switch, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { useAppStore } from '../../store/useAppStore';

const appVersion = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const { isWowMember, toggleWowMember, notificationEnabled, toggleNotification } = useAppStore();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>설정</Text>

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

      <Text style={styles.sectionTitle}>일반</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="star-outline" size={20} color={theme.primary} />
            <View style={styles.rowText}>
              <Text style={styles.label}>와우 회원</Text>
              <Text style={styles.desc}>와우 회원가로 목표가 비교</Text>
            </View>
          </View>
          <Switch
            value={isWowMember}
            onValueChange={toggleWowMember}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={theme.text}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>정보</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => Alert.alert('안내', '준비 중입니다')}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    paddingTop: 16,
    marginBottom: 24,
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
});
