import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { theme } from '../constants/theme';

function extractCoupangUrl(shareIntent: any): string | null {
  // 1순위: webUrl (link.coupang.com 형태)
  const webUrl = shareIntent?.webUrl || '';
  if (webUrl.includes('coupang.com')) return webUrl;

  // 2순위: text에서 URL 추출 (텍스트 속 URL 파싱)
  const text = shareIntent?.text || '';
  const urlMatch = text.match(/https?:\/\/[^\s]+coupang\.com[^\s]*/i);
  if (urlMatch) return urlMatch[0];

  return null;
}

export default function ShareIntentScreen() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;

    const coupangUrl = extractCoupangUrl(shareIntent);
    const sharedText = shareIntent?.text || '';

    // 홈으로 먼저 이동 후 모달을 push
    router.replace('/');

    if (coupangUrl) {
      setTimeout(() => {
        router.push({
          pathname: '/modal/add-item',
          params: { sharedUrl: coupangUrl, sharedText },
        });
      }, 300);
    }

    resetShareIntent();
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
