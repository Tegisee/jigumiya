import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { theme } from '../constants/theme';

export default function ShareIntentScreen() {
  const router = useRouter();
  const { hasShareIntent } = useShareIntentContext();

  // Share Intent 처리는 _layout.tsx의 ShareIntentHandler에서 수행
  // 이 화면은 자동 라우팅 대상으로만 존재
  useEffect(() => {
    if (!hasShareIntent) {
      // intent 없이 이 화면에 도달한 경우 홈으로 이동
      router.replace('/');
    }
  }, [hasShareIntent]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={styles.text}>공유 데이터 처리중...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    color: theme.subtext,
    fontSize: 14,
  },
});
