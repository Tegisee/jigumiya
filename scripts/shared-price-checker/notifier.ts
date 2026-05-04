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
  | { type: 'broadcast_drop10'; token: string; items: ProductBrief[] } // legacy, 미사용
  | { type: 'broadcast_drop20'; token: string; items: ProductBrief[] } // legacy, 미사용
  // G v2 (2026-05-04): 카테고리 베스트 10% 이상 급락 → 추적자 외 활성 사용자 전체 발송
  | {
      type: 'category_broadcast';
      token: string;
      item: ProductBrief;
      dropRate: number;
    };

const MESSAGES = {
  morning: [
    { title: '좋은 아침이에요 🌅', body: '오늘도 좋은 가격을 찾아드릴게요' },
    { title: '기다렸다, 지금이야!', body: '오늘의 가격을 확인해보세요' },
    { title: '좋은 아침이에요!', body: '관심 상품 가격을 확인해볼까요?' },
  ],
  // 복수형(n>1) 전용 — body에 반드시 {N} 포함. 단일(n===1)은 buildMessage에서 별도 형식 사용.
  priceDropSummary: [
    {
      title: '가격이 내려갔어요 📉',
      body: '관심 상품 {N}개 가격이 내려갔어요. 확인해보세요',
    },
    {
      title: '기다렸다, 지금이야!',
      body: '관심 상품 {N}개 가격이 떨어졌어요. 지금 확인해보세요',
    },
    {
      title: '가격이 내려갔어요!',
      body: '{N}개 상품 가격 하락! 놓치지 마세요 🛒',
    },
  ],
  targetReached: [
    { title: '🎯 목표가 도달!', body: '지금이 바로 그 순간이에요' },
    { title: '기다리던 가격이 됐어요!', body: '지금 확인해보세요 ✨' },
    { title: '드디어!', body: '관심 상품이 목표가에 도달했어요 🎉' },
  ],
  // 복수형(n>1) 전용 — body에 반드시 {N} 포함.
  priceUpSummary: [
    {
      title: '가격이 올랐어요 📈',
      body: '관심 상품 {N}개 가격이 올랐어요. 확인해보세요',
    },
    {
      title: '가격이 올랐어요',
      body: '{N}개 상품 가격 상승! 구매 계획이 있다면 서두르세요',
    },
    {
      title: '더 오르기 전에',
      body: '관심 상품 {N}개 — 확인해보는 건 어떨까요? 💭',
    },
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
  // G v2 (2026-05-04): placeholder — {name} 상품명, {rate} 할인율(절댓값 정수), {prev}/{curr} 가격
  categoryBroadcast: [
    {
      title: '⚡ 급락 알림',
      body: '{name} {rate}% 급락! 지금 확인해보세요',
    },
    {
      title: '🔥 특가 알림',
      body: '{name} 특가! {prev}원 → {curr}원',
    },
    {
      title: '📉 가격 하락',
      body: '{name} {rate}% 내려갔어요',
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
  // 'price_change' = 가격변동 탭 (category_broadcast 전용, G v2). 클라이언트는 'price-drops'와 동일 처리.
  screen: 'home' | 'detail' | 'price-drops' | 'price_change';
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
      const name = p.item.productName.slice(0, 20);
      const prev = p.item.previousPrice.toLocaleString();
      const cur = p.item.currentPrice.toLocaleString();
      return {
        title: m.title,
        body: `${name} ${prev}원 → ${cur}원 🎯`,
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
      if (n === 1) {
        const it = p.items[0];
        const name = it.productName.slice(0, 20);
        const prev = it.previousPrice.toLocaleString();
        const cur = it.currentPrice.toLocaleString();
        return {
          title: m.title,
          body: `${name} ${prev}원 → ${cur}원 ↓`,
          data: { screen: 'detail', itemId: it.productId, alertType: p.type },
        };
      }
      return {
        title: m.title,
        body: fillN(m.body, n),
        data: { screen: 'home', alertType: p.type },
      };
    }
    case 'price_up_summary': {
      const m = pickRandom(MESSAGES.priceUpSummary);
      const n = p.items.length;
      if (n === 1) {
        const it = p.items[0];
        const name = it.productName.slice(0, 20);
        const prev = it.previousPrice.toLocaleString();
        const cur = it.currentPrice.toLocaleString();
        return {
          title: m.title,
          body: `${name} ${prev}원 → ${cur}원 ↑`,
          data: { screen: 'detail', itemId: it.productId, alertType: p.type },
        };
      }
      return {
        title: m.title,
        body: fillN(m.body, n),
        data: { screen: 'home', alertType: p.type },
      };
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
    case 'category_broadcast': {
      const m = pickRandom(MESSAGES.categoryBroadcast);
      const name = p.item.productName.slice(0, 20);
      const rate = Math.abs(Math.round(p.dropRate));
      const prev = p.item.previousPrice.toLocaleString();
      const curr = p.item.currentPrice.toLocaleString();
      const body = m.body
        .replace('{name}', name)
        .replace('{rate}', String(rate))
        .replace('{prev}', prev)
        .replace('{curr}', curr);
      return {
        title: m.title,
        body,
        data: {
          screen: 'price_change',
          itemId: p.item.productId,
          alertType: p.type,
        },
      };
    }
  }
}

export interface SendResult {
  successfulTokens: Set<string>;
  invalidTokens: string[];
}

/**
 * 푸시 발송. chunk 단위 try/catch + batch 거절 시 1건씩 fallback (다른 EAS projectId 토큰 혼재 방어).
 *
 * 반환:
 *   - successfulTokens: ticket.status === 'ok'로 응답된 토큰 (lastNotifications 업데이트 대상)
 *   - invalidTokens: DeviceNotRegistered / InvalidCredentials 토큰 (cleanup 대상)
 */
export async function sendSmartNotifications(
  payloads: PushPayload[],
): Promise<SendResult> {
  const successfulTokens = new Set<string>();
  const invalidTokens: string[] = [];
  if (payloads.length === 0) return { successfulTokens, invalidTokens };

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

  for (const chunk of chunks) {
    let tickets: ExpoPushTicket[] = [];
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
      console.log('[Push] 발송:', tickets.length, '건');
    } catch (e) {
      console.warn(
        '[Push] batch 거절 → 1건씩 재시도:',
        e instanceof Error ? e.message.slice(0, 200) : String(e),
      );
      // 한 batch에 다른 EAS projectId 토큰이 섞이면 Expo가 전체 거절. 1건씩 보내면 충돌 회피.
      tickets = [];
      for (const m of chunk) {
        try {
          const single = await expo.sendPushNotificationsAsync([m]);
          tickets.push(...single);
        } catch (innerE) {
          const tokenStr =
            typeof m.to === 'string' ? m.to : Array.isArray(m.to) ? m.to[0] : '';
          console.warn(
            '[Push] 단건 실패:',
            tokenStr?.slice(0, 30),
            innerE instanceof Error ? innerE.message.slice(0, 120) : String(innerE),
          );
          // index 정합성 유지용 sentinel — ProviderError는 cleanup 대상 아님 (토큰 보존)
          tickets.push({
            status: 'error',
            message: innerE instanceof Error ? innerE.message : String(innerE),
            details: { error: 'ProviderError' },
          } as unknown as ExpoPushTicket);
        }
      }
    }

    tickets.forEach((ticket, i) => {
      const m = chunk[i];
      const token =
        typeof m?.to === 'string' ? m.to : Array.isArray(m?.to) ? m.to[0] : '';
      if (ticket.status === 'ok') {
        if (token) successfulTokens.add(token);
      } else if (ticket.status === 'error') {
        if (
          ticket.details?.error === 'DeviceNotRegistered' ||
          ticket.details?.error === 'InvalidCredentials'
        ) {
          console.log('[Push] 만료 토큰:', token?.slice(0, 30));
          if (token) invalidTokens.push(token);
        }
      }
    });
  }

  return { successfulTokens, invalidTokens };
}
