import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

const MESSAGES = [
  { title: '지금이야', body: '찜해둔 상품이 목표가 밑으로 떨어졌어요!' },
  { title: '지금이야', body: '드디어 때가 왔습니다. 결제하러 가실 시간이에요!' },
  { title: '지금이야', body: '헉! 방금 가격 내려갔어요. 언제 다시 오를지 몰라요!' },
  { title: '지금이야', body: '잊고 계셨죠? 찜해둔 그 아이템, 지금이 줍줍할 타이밍!' },
];

const DAILY_MESSAGES = [
  { title: '지금이야', body: '오늘의 가격 현황을 확인해보세요!' },
  { title: '지금이야', body: '찜한 상품들, 오늘 가격은 어떨까요?' },
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface PushTarget {
  token: string;
  itemId: string;
  productName: string;
  currentPrice: number;
  previousPrice: number;
}

/** 가격 하락 알림 발송 */
export async function sendPriceDropNotifications(
  targets: PushTarget[],
): Promise<void> {
  if (targets.length === 0) return;

  const messages: ExpoPushMessage[] = targets
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => {
      const msg = randomPick(MESSAGES);
      return {
        to: t.token,
        sound: 'default' as const,
        title: msg.title,
        body: `${t.productName} ${t.currentPrice.toLocaleString()}원 (${t.previousPrice.toLocaleString()}원에서 하락)`,
        data: { itemId: t.itemId, screen: 'detail' },
      };
    });

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      console.log('[Push] 발송:', receipts.length, '건');
    } catch (e) {
      console.error('[Push] 발송 실패:', e);
    }
  }
}

/** 일간 요약 알림 발송 (21:00 KST) */
export async function sendDailyNotifications(
  tokens: string[],
): Promise<void> {
  if (tokens.length === 0) return;

  const msg = randomPick(DAILY_MESSAGES);
  const messages: ExpoPushMessage[] = tokens
    .filter((t) => Expo.isExpoPushToken(t))
    .map((t) => ({
      to: t,
      sound: 'default' as const,
      title: msg.title,
      body: msg.body,
      data: { screen: 'home' },
    }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.error('[Push] 일간 알림 발송 실패:', e);
    }
  }
  console.log('[Push] 일간 알림 발송:', tokens.length, '명');
}
