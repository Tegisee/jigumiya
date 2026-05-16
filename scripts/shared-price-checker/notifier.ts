import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

export interface ProductBrief {
  productId: string;
  productName: string;
  currentPrice: number;
  previousPrice: number;
}

/**
 * 1.0.20 (docs/026): apiPrice 단일 출처. 알림 종류 3종으로 단일화.
 *   - price_drop_summary: 추적/자주사는 상품 가격 하락 (요약 또는 단일)
 *   - target_reached: 목표 기준가격 도달
 *   - price_up_summary: 가격 상승 (사용자 옵션)
 * legacy(morning/evening/broadcast_drop10/20)는 정식 삭제.
 */
export type PushPayload =
  | { type: 'price_drop_summary'; token: string; items: ProductBrief[] }
  | {
      type: 'target_reached';
      token: string;
      item: ProductBrief;
      targetPrice: number;
    }
  | { type: 'price_up_summary'; token: string; items: ProductBrief[] };

interface MessageData extends Record<string, unknown> {
  screen: 'home' | 'detail' | 'price-drops';
  itemId?: string;
  alertType: PushPayload['type'];
}

function truncateName(name: string, max: number = 20): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

function buildMessage(p: PushPayload): {
  title: string;
  body: string;
  data: MessageData;
} {
  switch (p.type) {
    case 'target_reached': {
      const name = truncateName(p.item.productName);
      const cur = p.item.currentPrice.toLocaleString();
      const target = p.targetPrice.toLocaleString();
      return {
        title: `${name} 목표 기준가격 도달!`,
        body: `기준가격 ${cur}원 (목표 ${target}원)\n실제 결제가는 쿠팡에서 확인하세요`,
        data: {
          screen: 'detail',
          itemId: p.item.productId,
          alertType: p.type,
        },
      };
    }
    case 'price_drop_summary': {
      const n = p.items.length;
      if (n === 1) {
        const it = p.items[0];
        const name = truncateName(it.productName);
        const prev = it.previousPrice.toLocaleString();
        const cur = it.currentPrice.toLocaleString();
        const dropPct =
          it.previousPrice > 0
            ? Math.round(((it.currentPrice - it.previousPrice) / it.previousPrice) * 100)
            : 0;
        return {
          title: `${name} 기준가격이 내렸어요!`,
          body: `${prev}원 → ${cur}원 (${dropPct}%)\n실제 결제가는 쿠팡에서 확인하세요`,
          data: { screen: 'detail', itemId: it.productId, alertType: p.type },
        };
      }
      return {
        title: '기준가격이 내렸어요!',
        body: `관심 상품 ${n}개 기준가격 하락\n실제 결제가는 쿠팡에서 확인하세요`,
        data: { screen: 'home', alertType: p.type },
      };
    }
    case 'price_up_summary': {
      const n = p.items.length;
      if (n === 1) {
        const it = p.items[0];
        const name = truncateName(it.productName);
        const prev = it.previousPrice.toLocaleString();
        const cur = it.currentPrice.toLocaleString();
        const upPct =
          it.previousPrice > 0
            ? Math.round(((it.currentPrice - it.previousPrice) / it.previousPrice) * 100)
            : 0;
        return {
          title: `${name} 기준가격이 올랐어요!`,
          body: `${prev}원 → ${cur}원 (+${upPct}%)`,
          data: { screen: 'detail', itemId: it.productId, alertType: p.type },
        };
      }
      return {
        title: '기준가격이 올랐어요',
        body: `관심 상품 ${n}개 기준가격 상승`,
        data: { screen: 'home', alertType: p.type },
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
