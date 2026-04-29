import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

export interface ProductBrief {
  productId: string;
  productName: string;
  currentPrice: number;
  previousPrice: number;
}

export type PushPayload =
  | { type: 'morning_greeting'; token: string }
  | { type: 'price_drop_summary'; token: string; items: ProductBrief[] }
  | {
      type: 'target_reached';
      token: string;
      item: ProductBrief;
      targetPrice: number;
    }
  | { type: 'price_up_summary'; token: string; items: ProductBrief[] }
  | { type: 'evening_no_change'; token: string }
  | { type: 'broadcast_drop10'; token: string; items: ProductBrief[] }
  | { type: 'broadcast_drop20'; token: string; items: ProductBrief[] };

const MESSAGES = {
  morning: [
    { title: '좋은 아침이에요 🌅', body: '오늘도 좋은 가격을 찾아드릴게요' },
    { title: '기다렸다, 지금이야!', body: '오늘의 가격을 확인해보세요' },
    { title: '좋은 아침이에요!', body: '관심 상품 가격을 확인해볼까요?' },
  ],
  priceDropSummary: [
    {
      title: '가격이 내려갔어요 📉',
      body: '관심 상품 {N}개 가격이 내려갔어요. 지금 확인해보세요!',
    },
    {
      title: '기다렸다, 지금이야!',
      body: '관심 상품 {N}개 가격이 떨어졌어요',
    },
    { title: '가격이 내려갔어요!', body: '구매 타이밍을 놓치지 마세요 🛒' },
  ],
  targetReached: [
    { title: '🎯 목표가 도달!', body: '지금이 바로 그 순간이에요' },
    { title: '기다리던 가격이 됐어요!', body: '지금 확인해보세요 ✨' },
    { title: '드디어!', body: '관심 상품이 목표가에 도달했어요 🎉' },
  ],
  priceUpSummary: [
    {
      title: '가격이 올랐어요 📈',
      body: '관심 상품 {N}개 가격이 올랐어요. 확인해보세요',
    },
    {
      title: '가격이 올랐어요',
      body: '관심 상품 {N}개 — 구매 계획이 있다면 서두르세요!',
    },
    { title: '더 오르기 전에', body: '확인해보는 건 어떨까요? 💭' },
  ],
  eveningNoChange: [
    { title: '오늘은 변동이 없었어요 🌙', body: '내일을 기대해봐요' },
    { title: '오늘도 열심히 확인했어요', body: '조금만 더 기다려봐요!' },
    { title: '아직은 때가 아닌가봐요', body: '계속 지켜볼게요 👀' },
  ],
  broadcast10: [
    { title: '🔥 지금이야!', body: '인기 상품 가격이 크게 내려갔어요' },
    {
      title: '놓치면 후회해요!',
      body: '카테고리 베스트 상품 가격 급락 중 📉',
    },
    {
      title: '지금이 기회예요!',
      body: '베스트 상품 중 {N}개 가격이 10% 이상 떨어졌어요',
    },
  ],
  broadcast20: [
    { title: '🚨 지금 당장!', body: '인기 상품 가격이 20% 이상 폭락했어요' },
    {
      title: '이런 가격은 다시 오기 힘들어요!',
      body: '지금 바로 확인하세요 🔥',
    },
    {
      title: '역대급 할인!',
      body: '베스트 상품 {N}개 가격이 20% 이상 내려갔어요 💥',
    },
  ],
} as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillN(template: string, n: number): string {
  return template.replace('{N}', String(n));
}

interface MessageData extends Record<string, unknown> {
  screen: 'home' | 'detail' | 'price-drops';
  itemId?: string;
  alertType: PushPayload['type'];
}

function buildMessage(p: PushPayload): {
  title: string;
  body: string;
  data: MessageData;
} {
  switch (p.type) {
    case 'morning_greeting': {
      const m = pickRandom(MESSAGES.morning);
      return {
        title: m.title,
        body: m.body,
        data: { screen: 'home', alertType: p.type },
      };
    }
    case 'evening_no_change': {
      const m = pickRandom(MESSAGES.eveningNoChange);
      return {
        title: m.title,
        body: m.body,
        data: { screen: 'home', alertType: p.type },
      };
    }
    case 'target_reached': {
      const m = pickRandom(MESSAGES.targetReached);
      const cur = p.item.currentPrice.toLocaleString();
      const name = p.item.productName.slice(0, 20);
      return {
        title: m.title,
        body: `${name} ${cur}원 — ${m.body}`,
        data: {
          screen: 'detail',
          itemId: p.item.productId,
          alertType: p.type,
        },
      };
    }
    case 'price_drop_summary': {
      const m = pickRandom(MESSAGES.priceDropSummary);
      const n = p.items.length;
      const data: MessageData =
        n === 1
          ? {
              screen: 'detail',
              itemId: p.items[0].productId,
              alertType: p.type,
            }
          : { screen: 'home', alertType: p.type };
      return { title: m.title, body: fillN(m.body, n), data };
    }
    case 'price_up_summary': {
      const m = pickRandom(MESSAGES.priceUpSummary);
      const n = p.items.length;
      const data: MessageData =
        n === 1
          ? {
              screen: 'detail',
              itemId: p.items[0].productId,
              alertType: p.type,
            }
          : { screen: 'home', alertType: p.type };
      return { title: m.title, body: fillN(m.body, n), data };
    }
    case 'broadcast_drop10': {
      const m = pickRandom(MESSAGES.broadcast10);
      const n = p.items.length;
      return {
        title: m.title,
        body: fillN(m.body, n),
        data: { screen: 'price-drops', alertType: p.type },
      };
    }
    case 'broadcast_drop20': {
      const m = pickRandom(MESSAGES.broadcast20);
      const n = p.items.length;
      return {
        title: m.title,
        body: fillN(m.body, n),
        data: { screen: 'price-drops', alertType: p.type },
      };
    }
  }
}

/**
 * 푸시 발송 — 발송 실패한(만료) 토큰 목록 반환 (cleanup용)
 */
export async function sendSmartNotifications(
  payloads: PushPayload[],
): Promise<string[]> {
  if (payloads.length === 0) return [];

  const valid = payloads.filter((p) => Expo.isExpoPushToken(p.token));

  const messages: ExpoPushMessage[] = valid.map((p) => {
    const { title, body, data } = buildMessage(p);
    return {
      to: p.token,
      sound: 'default' as const,
      title,
      body,
      data,
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

  const invalidTokens: string[] = [];
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
