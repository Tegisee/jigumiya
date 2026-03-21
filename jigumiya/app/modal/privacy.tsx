import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
          <Text style={styles.headerBtnText}>설정</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>개인정보처리방침</Text>
        <Text style={styles.date}>시행일: 2026년 3월 14일</Text>

        <Text style={styles.heading}>1. 수집하는 개인정보</Text>
        <Text style={styles.body}>
          지금이야(이하 "앱")는 서비스 제공을 위해 다음 정보를 수집합니다.{'\n'}
          {'\n'}• 기기 식별자 (익명 인증용){'\n'}
          • 푸시 알림 토큰 (알림 발송용){'\n'}
          • 사용자가 등록한 상품 URL 및 목표가
        </Text>

        <Text style={styles.heading}>2. 개인정보의 이용 목적</Text>
        <Text style={styles.body}>
          수집된 정보는 다음 목적으로만 사용됩니다.{'\n'}
          {'\n'}• 상품 가격 변동 추적 및 알림 서비스 제공{'\n'}
          • 서비스 개선 및 안정적 운영
        </Text>

        <Text style={styles.heading}>3. 개인정보의 보관 및 파기</Text>
        <Text style={styles.body}>
          • 데이터는 Firebase 클라우드에 암호화되어 저장됩니다.{'\n'}
          • 앱 내 "전체 데이터 초기화" 기능으로 즉시 삭제 가능합니다.{'\n'}
          • 서비스 탈퇴(앱 삭제) 시 관련 데이터는 30일 이내 파기됩니다.
        </Text>

        <Text style={styles.heading}>4. 제3자 제공</Text>
        <Text style={styles.body}>
          앱은 사용자의 개인정보를 제3자에게 제공하지 않습니다.{'\n'}
          다만, 쿠팡 파트너스 프로그램을 통한 제휴 링크가 포함될 수 있으며, 이는 쿠팡의 개인정보처리방침을 따릅니다.
        </Text>

        <Text style={styles.heading}>5. 쿠팡 파트너스 안내</Text>
        <Text style={styles.body}>
          이 앱은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </Text>

        <Text style={styles.heading}>6. 이용자의 권리</Text>
        <Text style={styles.body}>
          • 언제든지 앱 설정에서 알림 수신을 거부할 수 있습니다.{'\n'}
          • 등록한 상품 데이터를 삭제하거나 전체 초기화할 수 있습니다.
        </Text>

        <Text style={styles.heading}>7. 문의</Text>
        <Text style={styles.body}>
          개인정보 관련 문의: june56189906@gmail.com
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    color: theme.subtext,
    marginBottom: 24,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: theme.subtext,
    lineHeight: 22,
  },
});
