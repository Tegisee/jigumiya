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
  | { type: 'broadcast_drop20'; token: string; items: ProductBrief[] }; // legacy, 미사용

// KST_OFFSET — KST 요일 계산용 (2026-05-05 C: 요일별 단일 문구)
const KST_OFFSET = 9 * 3600 * 1000;

/** KST 기준 요일 — 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토 */
function getKstDayOfWeek(): number {
  const kst = new Date(Date.now() + KST_OFFSET);
  return kst.getUTCDay();
}

// 2026-05-05 C: 기존 랜덤 풀 → 요일별 단일 문구로 교체.
// 인덱스 = 요일 (0=일, 1=월, ..., 6=토). title은 시간대 공통, body가 요일별 사용자 사양 그대로.
const MESSAGES = {
  morning: [
    { title: '🌅 좋은 아침이에요', body: '일요일 아침, 오늘도 좋은 하루 되세요 ☀️' },          // 0=일
    { title: '🌅 좋은 아침이에요', body: '한 주 시작! 오늘의 특가 확인해보세요 ⚡' },         // 1=월
    { title: '🌅 좋은 아침이에요', body: '오늘도 득템의 기회! 가격 체크해보세요 💪' },        // 2=화
    { title: '🌅 좋은 아침이에요', body: '주중 최고의 날! 오늘 특가 놓치지 마세요 🔥' },      // 3=수
    { title: '🌅 좋은 아침이에요', body: '내일이면 불금! 미리 장바구니 채워두세요 🎯' },      // 4=목
    { title: '🌅 좋은 아침이에요', body: '불금이에요! 오늘의 특가 확인해보세요 🎉' },         // 5=금
    { title: '🌅 좋은 아침이에요', body: '주말이에요! 여유롭게 가격 구경해보세요 😎' },       // 6=토
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
    { title: '🌙 오늘도 수고했어요', body: '내일을 위해 미리 장바구니 확인해보세요 💡' },                 // 0=일
    { title: '🌙 오늘도 수고했어요', body: '월요일도 수고하셨어요. 오늘 가격 변동 확인해보셨나요? 🛒' },  // 1=월
    { title: '🌙 오늘도 수고했어요', body: '화요일 저녁, 장바구니 점검 어때요? 🛍️' },                     // 2=화
    { title: '🌙 오늘도 수고했어요', body: '벌써 수요일 저녁이에요. 오늘 하루도 수고하셨어요 😊' },        // 3=수
    { title: '🌙 오늘도 수고했어요', body: '목요일 저녁, 주말 쇼핑 미리 준비해보세요 🛒' },               // 4=목
    { title: '🌙 오늘도 수고했어요', body: '한 주 마무리 수고하셨어요! 주말 특가 확인해보세요 🎁' },     // 5=금
    { title: '🌙 오늘도 수고했어요', body: '토요일 저녁, 편안한 밤 되세요 🌙' },                          // 6=토
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
      // 2026-05-05 C: 요일별 단일 문구 (KST 기준)
      const m = MESSAGES.morning[getKstDayOfWeek()];
      return {
        title: m.title,
        body: m.body,
        data: { screen: 'home', alertType: p.type },
      };
    }
    case 'evening_no_change': {
      // 2026-05-05 C: 요일별 단일 문구 (KST 기준)
      const m = MESSAGES.eveningNoChange[getKstDayOfWeek()];
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
