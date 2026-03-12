import { useEffect, useRef } from 'react';
import { Slot, Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { ShareIntentProvider } from 'expo-share-intent';
import { theme } from '../constants/theme';
import { initCoupangApi } from '../services/config';
import { signInAnonymously } from '../services/firebase';
import {
  registerForPushNotifications,
  getItemIdFromNotification,
} from '../services/notifications';

export default function RootLayout() {
  const router = useRouter();
  const notifListenerRef = useRef<Notifications.EventSubscription>(null);

  useEffect(() => {
    initCoupangApi();

    (async () => {
      await signInAnonymously();
      await registerForPushNotifications();
    })();

    // 알림 클릭 리스너
    notifListenerRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const itemId = getItemIdFromNotification(response);
        if (itemId) {
          router.push(`/detail/${itemId}`);
        }
      });

    // 앱 종료 상태에서 알림 클릭으로 열린 경우
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const itemId = getItemIdFromNotification(response);
        if (itemId) router.push(`/detail/${itemId}`);
      }
    });

    return () => {
      notifListenerRef.current?.remove();
    };
  }, []);

  return (
    <ShareIntentProvider
      options={{
        debug: true,
        resetOnBackground: true,
        onResetShareIntent: () => router.replace('/'),
      }}
    >
      <StatusBar style="light" />
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
