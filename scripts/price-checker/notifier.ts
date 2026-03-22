import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

export type AlertType = 'target_reached' | 'price_drop' | 'lowest_ever' | 'no_change';

export interface SmartPushTarget {
  token: string;
  itemId: string;
  productName: string;
  alertType: AlertType;
  currentPrice: number;
  previousPrice: number;
  targetPrice: number;
  lowestPrice: number;
  noChangeDays: number;
}

function buildMessage(t: SmartPushTarget): { title: string; body: string } {
  const name = t.productName.slice(0, 20);
  const cur = t.currentPrice.toLocaleString();
  const prev = t.previousPrice.toLocaleString();

  switch (t.alertType) {
    case 'target_reached':
      return {
        title: '기다렸다, 지금이야!',
        body: `${name} ${cur}원 — 목표가 도달!`,
      };
    case 'price_drop': {
      const gap = t.targetPrice - t.currentPrice;
      if (gap > 0) {
        return {
          title: '가격이 내려갔어요!',
          body: `${name} ${prev}원 → ${cur}원! 목표가까지 ${gap.toLocaleString()}원`,
        };
      }
      return {
        title: '가격이 내려갔어요!',
        body: `${name} ${prev}원 → ${cur}원!`,
      };
    }
    case 'lowest_ever':
      return {
        title: '역대 최저가!',
        body: `${name} ${cur}원 — 지금까지 가장 낮은 가격이에요!`,
      };
    case 'no_change':
      return {
        title: '가격 변동 없음',
        body: `${name} ${t.noChangeDays}일째 같은 가격입니다 (${cur}원)`,
      };
  }
}

/**
 * 스마트 알림 발송 — 실패한 토큰 목록 반환 (고아 데이터 정리용)
 */
export async function sendSmartNotifications(
  targets: SmartPushTarget[],
): Promise<string[]> {
  if (targets.length === 0) return [];

  const invalidTokens: string[] = [];

  const messages: ExpoPushMessage[] = targets
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => {
      const { title, body } = buildMessage(t);
      return {
        to: t.token,
        sound: 'default' as const,
        title,
        body,
        data: { itemId: t.itemId, screen: 'detail', alertType: t.alertType },
      };
    });

  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const result = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...result);
      console.log('[Push] 발송:', result.length, '건');
    } catch (e) {
      console.error('[Push] 발송 실패:', e);
    }
  }

  // 발송 실패 토큰 수집 (DeviceNotRegistered = 앱 삭제/토큰 만료)
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'error') {
      const token = messages[i]?.to as string;
      if (
        ticket.details?.error === 'DeviceNotRegistered' ||
        ticket.details?.error === 'InvalidCredentials'
      ) {
        console.log('[Push] 만료 토큰:', token?.slice(0, 30));
        if (token) invalidTokens.push(token);
      }
    }
  });

  return invalidTokens;
}
