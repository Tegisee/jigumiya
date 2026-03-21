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

/** 알림 클릭 시 itemId 추출 */
export function getItemIdFromNotification(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data;
  return (data?.itemId as string) ?? null;
}
