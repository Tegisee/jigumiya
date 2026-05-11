import { useEffect, useRef } from 'react';
import { Platform, InteractionManager, AppState } from 'react-native';
import { Slot, Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { theme } from '../constants/theme';
import { initCoupangApi } from '../services/config';
import {
  signInAnonymously,
  warmupResolveAffiliate,
  ensureUserDoc,
} from '../services/firebase';
import {
  registerForPushNotifications,
  resolveNotificationRoute,
  clearBadgeCount,
} from '../services/notifications';
import { checkForUpdate } from '../services/updateChecker';
import { useAppStore } from '../store/useAppStore';
import OnboardingScreen from '../components/OnboardingScreen';

function extractCoupangUrl(shareIntent: any): string | null {
  const webUrl = shareIntent?.webUrl || '';
  if (webUrl.includes('coupang.com')) return webUrl;
  const text = shareIntent?.text || '';
  const urlMatch = text.match(/https?:\/\/[^\s]+coupang\.com[^\s]*/i);
  if (urlMatch) return urlMatch[0];
  const directUrl = shareIntent?.url || '';
  if (directUrl.includes('coupang.com')) return directUrl;
  return null;
}

/** Share Intent를 감지하여 add-item 모달로 라우팅 */
function ShareIntentHandler() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const processingRef = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || processingRef.current) return;
    processingRef.current = true;

    const coupangUrl = extractCoupangUrl(shareIntent);
    const sharedText = shareIntent?.text || '';
    console.log('[ShareIntentHandler] coupangUrl:', coupangUrl);

    resetShareIntent();

    if (coupangUrl) {
      router.replace('/');
      const delay = Platform.OS === 'android' ? 600 : 300;
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          router.push({
            pathname: '/modal/add-item',
            params: { sharedUrl: coupangUrl, sharedText },
          });
          // 모달 push 완료 후 다음 share intent 수신 가능
          setTimeout(() => { processingRef.current = false; }, 1000);
        }, delay);
      });
    } else {
      processingRef.current = false;
    }
  }, [hasShareIntent]);

  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const notifListenerRef = useRef<Notifications.EventSubscription>(null);
  const { hasSeenOnboarding, completeOnboarding } = useAppStore();

  useEffect(() => {
    initCoupangApi();

    // 업데이트 알림 — 인증 대기 없이 즉시 체크 (rules: read if true)
    checkForUpdate();

    (async () => {
      const uid = await signInAnonymously();
      // 권한/토큰 발급 결과와 무관하게 user doc 보장 (5/6 갤럭시 알림 0건 사고 fix)
      if (uid) await ensureUserDoc(uid);
      // Functions 컨테이너 워밍업 — fire-and-forget, 쿠팡 공유 첫 호출 cold start 제거
      warmupResolveAffiliate();
      await registerForPushNotifications();
    })();

    // 앱 실행 직후 뱃지 초기화
    clearBadgeCount();

    // background → active 전환 시 뱃지 초기화 + Functions warmup 재발사
    // (idle timeout으로 인스턴스가 종료된 케이스 보강 — 다음 callResolveAffiliate 콜드 회피)
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        clearBadgeCount();
        warmupResolveAffiliate();
      }
    });

    // 알림 클릭 리스너
    notifListenerRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const route = resolveNotificationRoute(response);
        if (route) router.push(route as never);
      });

    // 앱 종료 상태에서 알림 클릭으로 열린 경우
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const route = resolveNotificationRoute(response);
        if (route) router.push(route as never);
      }
    });

    return () => {
      notifListenerRef.current?.remove();
      appStateSub.remove();
    };
  }, []);

  if (!hasSeenOnboarding) {
    return (
      <>
        <StatusBar style="light" />
        <OnboardingScreen onComplete={completeOnboarding} />
      </>
    );
  }

  return (
    <ShareIntentProvider
      options={{
        debug: true,
        resetOnBackground: true,
        onResetShareIntent: () => router.replace('/'),
      }}
    >
      <StatusBar style="light" />
      <ShareIntentHandler />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="shareintent" options={{ headerShown: false }} />
        <Stack.Screen
          name="detail/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="today-best"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="event-best"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="coupang-pl"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="admin"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="modal/add-item"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </ShareIntentProvider>
  );
}
