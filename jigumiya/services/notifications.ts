import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { savePushToken } from './firebase';

// 포그라운드에서도 알림 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** 푸시 알림 권한 요청 + Expo Push Token 발급 → Firestore 저장 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '가격 알림',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[Notifications] EAS projectId 없음');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    await savePushToken(token);
    return token;
  } catch (e) {
    console.warn('[Notifications] 토큰 등록 실패:', e);
    return null;
  }
}

/**
 * 알림 클릭 시 라우팅할 경로를 결정.
 *  - data.screen === 'price-drops' / 'price_change' → /tracked 탭 (1.0.17 §앱구조 개편)
 *    cron notifier는 여전히 'price-drops' screen 값으로 발송하지만, 추적중 탭이 가격 변동
 *    확인 동선을 대체하므로 같은 경로로 처리. 'price_change'는 카테고리 베스트 broadcast.
 *  - data.screen === 'home'        → 홈 (/)
 *  - data.screen === 'detail' + itemId → /detail/{itemId}
 *  - 하위 호환: screen 없이 itemId만 → /detail/{itemId}
 */
export function resolveNotificationRoute(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data ?? {};
  const screen = data.screen as string | undefined;
  const itemId = data.itemId as string | undefined;

  if (screen === 'price-drops' || screen === 'price_change') return '/tracked';
  if (screen === 'home') return '/';
  if (screen === 'detail' && itemId) return `/detail/${itemId}`;
  if (itemId) return `/detail/${itemId}`;
  return null;
}

/** 앱 아이콘/알림 센터 뱃지 카운트 0으로 초기화 */
export async function clearBadgeCount(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (e) {
    console.warn('[Notifications] 뱃지 초기화 실패:', e);
  }
}
