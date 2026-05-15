import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { createHmac } from 'crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

// Admin SDK 1회 초기화 — onCall 핸들러는 admin 미사용이지만 트리거가 사용.
if (getApps().length === 0) initializeApp();
const adminDb = getFirestore();
const expoClient = new Expo();

const COUPANG_ACCESS_KEY = defineSecret('COUPANG_ACCESS_KEY');
const COUPANG_SECRET_KEY = defineSecret('COUPANG_SECRET_KEY');

const COUPANG_BASE_URL = 'https://api-gateway.coupang.com';
const DEEPLINK_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

const SAFARI_IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 200;

type ResolveResult =
  | {
      ok: true;
      shortenUrl: string;
      originalUrl: string;
      // 1.0.19 §1 — 상품 추가 시 WebView 없이도 카드에 표시할 메타데이터.
      // vp HTML의 OG 태그에서 best-effort 파싱. 추출 실패 시 빈 문자열/0.
      // 본 값들은 INIT 상태에서만 사용 — cron이 추후 정확한 apiPrice/realPrice로 덮어씀.
      productName?: string;
      productImage?: string;
      apiPrice?: number;
    }
  | {
      ok: false;
      error:
        | 'invalid_url'
        | 'resolve_failed'
        | 'deeplink_failed'
        | 'config_missing';
      detail?: string;
    };

function buildAuthorization(
  method: string,
  path: string,
  query: string,
  accessKey: string,
  secretKey: string,
): string {
  const datetime = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
    .slice(2);
  const message = datetime + method + path + query;
  const signature = createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

function isProductUrl(url: string): boolean {
  return url.includes('/vp/products/') || url.includes('/vm/products/');
}

/**
 * Coupang 단축 링크(link.coupang.com/a/...)는 3xx가 아니라
 * `redirectWebUrl = '...\\x3D...';` 형태의 JS 코드를 담은 200 HTML을 반환한다.
 * hex escape(\\xNN)를 디코드해 실제 vp URL을 추출한다.
 */
function extractRedirectUrlFromHtml(html: string): string | null {
  const match = html.match(
    /redirectWebUrl\s*=\s*['"]((?:\\x[0-9a-fA-F]{2}|[^'"\\])+)['"]/,
  );
  if (!match) return null;
  const decoded = match[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return decoded.includes('coupang.com') ? decoded : null;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  let attempt = 0;
  let delay = RETRY_BASE_DELAY_MS;
  let lastError: unknown;

  while (attempt < MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 500 && res.status < 600 && attempt < MAX_RETRIES - 1) {
        attempt++;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        attempt++;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('fetch_failed_unknown');
}

async function resolveRedirectChain(startUrl: string): Promise<string | null> {
  let currentUrl = startUrl;
  const visited = new Set<string>();
  const chain: Array<{ step: number; status?: number; url: string }> = [];

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    if (visited.has(currentUrl)) {
      logger.warn('[resolve] redirect loop detected', { chain });
      throw new Error('redirect_loop');
    }
    visited.add(currentUrl);

    if (isProductUrl(currentUrl)) {
      logger.info('[resolve] product URL reached', { step: i, chain, final: currentUrl });
      return currentUrl;
    }

    const res = await fetchWithRetry(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': SAFARI_IPHONE_UA },
    });
    chain.push({ step: i, status: res.status, url: currentUrl });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        logger.warn('[resolve] 3xx without Location header', { status: res.status, url: currentUrl });
        break;
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (res.status === 200) {
      const html = await res.text();
      const extracted = extractRedirectUrlFromHtml(html);
      if (extracted) {
        logger.info('[resolve] extracted from HTML redirectWebUrl', {
          step: i,
          from: currentUrl,
          to: extracted,
        });
        currentUrl = extracted;
        continue;
      }
      logger.warn('[resolve] 200 HTML without redirectWebUrl', {
        status: res.status,
        url: currentUrl,
        htmlSnippet: html.slice(0, 400),
      });
      break;
    }

    logger.warn('[resolve] non-3xx response, stop chain', { status: res.status, url: currentUrl, chain });
    break;
  }

  const ok = isProductUrl(currentUrl);
  if (!ok) logger.warn('[resolve] exhausted without product URL', { chain, last: currentUrl });
  return ok ? currentUrl : null;
}

/**
 * vp URL HTML에서 OG 태그 파싱 — 1.0.19 §1 상품 추가 메타데이터.
 *
 * 반환:
 *   - productName: og:title (가능하면 `| - 쿠팡` suffix 제거)
 *   - productImage: og:image
 *   - apiPrice: product:price:amount (정수, 실패 시 0)
 *
 * Akamai 챌린지 / 차단 시 빈 결과 반환 (main flow 차단 X).
 * 5초 timeout — Functions 전체 응답시간 영향 최소화.
 */
async function fetchVpMetadata(vpUrl: string): Promise<{
  productName: string;
  productImage: string;
  apiPrice: number;
}> {
  const empty = { productName: '', productImage: '', apiPrice: 0 };
  if (!vpUrl.includes('coupang.com')) return empty;

  try {
    const res = await fetchWithRetry(
      vpUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': SAFARI_IPHONE_UA,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      },
      5000,
    );
    if (res.status !== 200) {
      logger.warn('[vpMeta] non-200', { status: res.status, vpUrl: vpUrl.slice(0, 80) });
      return empty;
    }
    const html = await res.text();

    // Akamai 챌린지 페이지면 OG 태그 없음 → 즉시 포기
    if (
      html.includes('sec-if-cpt-container') ||
      html.includes('behavioral-content') ||
      html.includes('Powered and protected by Akamai')
    ) {
      logger.warn('[vpMeta] Akamai challenge detected', { vpUrl: vpUrl.slice(0, 80) });
      return empty;
    }

    const ogTitle = html.match(
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
    );
    const ogImage = html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    );
    const ogPrice = html.match(
      /<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i,
    );

    const productName = (ogTitle?.[1] ?? '')
      .replace(/\s*[|\-]\s*쿠팡.*$/, '')
      .trim();
    const productImage = ogImage?.[1] ?? '';
    const apiPrice = ogPrice
      ? parseInt(String(ogPrice[1]).replace(/[^0-9]/g, ''), 10) || 0
      : 0;

    logger.info('[vpMeta] parsed', {
      hasName: !!productName,
      hasImage: !!productImage,
      apiPrice,
      vpUrl: vpUrl.slice(0, 80),
    });
    return { productName, productImage, apiPrice };
  } catch (e) {
    logger.warn('[vpMeta] fetch/parse failed', {
      detail: e instanceof Error ? e.message : String(e),
      vpUrl: vpUrl.slice(0, 80),
    });
    return empty;
  }
}

async function callDeeplinkApi(
  originalUrl: string,
  accessKey: string,
  secretKey: string,
): Promise<{ shortenUrl: string; originalUrl: string } | null> {
  logger.info('[deeplink] request start', {
    urlLength: originalUrl.length,
    urlHead: originalUrl.slice(0, 120),
  });
  const auth = buildAuthorization(
    'POST',
    DEEPLINK_PATH,
    '',
    accessKey,
    secretKey,
  );
  const res = await fetchWithRetry(`${COUPANG_BASE_URL}${DEEPLINK_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body: JSON.stringify({ coupangUrls: [originalUrl] }),
  });
  logger.info('[deeplink] response status', { status: res.status });

  const rawText = await res.text();
  let json: {
    rCode?: string;
    rMessage?: string;
    data?: Array<{ shortenUrl?: string; originalUrl?: string }>;
  };
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    logger.error('[deeplink] non-JSON response', {
      status: res.status,
      bodyHead: rawText.slice(0, 400),
    });
    throw new Error('deeplink_non_json_response');
  }

  if (json.rCode === '0' && json.data?.[0]?.shortenUrl) {
    logger.info('[deeplink] success', {
      input: originalUrl,
      shortenUrl: json.data[0].shortenUrl,
      returnedOriginal: json.data[0].originalUrl,
    });
    return {
      shortenUrl: json.data[0].shortenUrl,
      originalUrl: json.data[0].originalUrl ?? originalUrl,
    };
  }

  logger.warn('[deeplink] failed', {
    rCode: json.rCode,
    rMessage: json.rMessage,
    input: originalUrl,
  });
  return null;
}

// ──────────────────────────────────────────────────────────
// shared_products/{productId} realPrice 변경 트리거 (docs/023 RealPrice 아키텍처)
//
// 흐름:
//   1. before.realPrice !== after.realPrice && after.realPrice > 0 일 때만 진행
//   2. collectionGroup('tracked').where('productId', '==', X) → 추적 uid + targetPrice 조회
//   3. afterReal <= targetPrice && (beforeReal > targetPrice || beforeReal == 0) → 도달 후보
//   4. user 검증 — app === 'jigumiya' + expoPushToken + notificationEnabled !== false
//   5. lastNotifications.targetReached[productId] 24h 가드 통과
//   6. token-share dedup (Set<token>) — 같은 단말 중복 발송 차단
//   7. Expo push 발송 + 성공 토큰의 uid에 lastNotifications 마킹
//   8. needsCheck 클리어 (트리거 자기 자신은 realPrice 미변경이라 무한 루프 X)
//
// 폐기 가능: cron의 `target_reached` 발송 로직은 본 트리거가 실시간 대체.
// ──────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const TARGET_REACHED_MESSAGES = [
  { title: '🎯 목표가 도달!', body: '지금이 바로 그 순간이에요' },
  { title: '기다리던 가격이 됐어요!', body: '지금 확인해보세요 ✨' },
  { title: '드디어!', body: '관심 상품이 목표가에 도달했어요 🎉' },
] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function clearNeedsCheck(
  productId: string,
  after: FirebaseFirestore.DocumentData,
): Promise<void> {
  if (after.needsCheck !== true) return;
  try {
    await adminDb
      .collection('shared_products')
      .doc(productId)
      .update({ needsCheck: false });
    logger.info('[realPrice] needsCheck 클리어', { productId });
  } catch (e) {
    logger.warn('[realPrice] needsCheck 클리어 실패', {
      productId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export const onSharedProductRealPriceChange = onDocumentUpdated(
  {
    document: 'shared_products/{productId}',
    region: 'asia-northeast3',
  },
  async (event) => {
    const productId = event.params.productId;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) {
      logger.warn('[realPrice] before/after 누락', { productId });
      return;
    }

    const beforeReal = Number(before.realPrice ?? 0);
    const afterReal = Number(after.realPrice ?? 0);

    // realPrice 미변경 또는 무효값이면 즉시 종료 — needsCheck 클리어 자체 트리거도 여기서 멈춤.
    if (beforeReal === afterReal || afterReal <= 0) {
      return;
    }

    // 1.0.19 §2 (docs/025) — priceStatus 가드. TRACKING 상태에서만 알림 발송.
    //   - INIT: realPrice 미존재 상태에서 이 트리거에 도달하지 않지만, 만일 도달해도 알림 X
    //   - SYNCING: 첫 realPrice 수신 baseline 단계라 "변동"이 아님 → 알림 X
    //   - TRACKING: 정상 변동 → 알림 발송
    //   - undefined (legacy 미마이그레이션 문서): 'TRACKING'으로 간주
    const afterStatus = (after.priceStatus as string | undefined) ?? 'TRACKING';
    if (afterStatus !== 'TRACKING') {
      logger.info('[realPrice] priceStatus 가드로 알림 스킵', {
        productId,
        priceStatus: afterStatus,
        beforeReal,
        afterReal,
      });
      // needsCheck는 클리어 — 다음 cron 사이클에서 중복 트리거 방지
      await clearNeedsCheck(productId, after);
      return;
    }

    const productName = (after.productName as string | undefined) ?? '';
    const previousPrice = beforeReal > 0 ? beforeReal : afterReal;

    logger.info('[realPrice] 변경 감지', {
      productId,
      productName: productName.slice(0, 30),
      before: beforeReal,
      after: afterReal,
    });

    // 1. productId 추적자 조회 — collectionGroup('tracked').where(productId)
    let trackedSnap: FirebaseFirestore.QuerySnapshot;
    try {
      trackedSnap = await adminDb
        .collectionGroup('tracked')
        .where('productId', '==', productId)
        .get();
    } catch (e) {
      logger.error('[realPrice] tracked 조회 실패', {
        productId,
        error: e instanceof Error ? e.message : String(e),
      });
      await clearNeedsCheck(productId, after);
      return;
    }

    // 2. 목표가 도달 필터 — afterReal <= target && (beforeReal == 0 또는 beforeReal > target)
    //    "이미 도달 상태"였던 항목은 신규 도달이 아니므로 제외 (재발송 방지).
    interface Candidate {
      uid: string;
      targetPrice: number;
    }
    const candidates: Candidate[] = [];
    for (const doc of trackedSnap.docs) {
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      const data = doc.data();
      const targetPrice = Number(data.targetPrice ?? 0);
      if (targetPrice <= 0) continue;
      if (afterReal > targetPrice) continue;
      if (beforeReal > 0 && beforeReal <= targetPrice) continue;
      candidates.push({ uid, targetPrice });
    }

    logger.info('[realPrice] 도달 후보', {
      productId,
      total: trackedSnap.size,
      qualified: candidates.length,
    });

    if (candidates.length === 0) {
      await clearNeedsCheck(productId, after);
      return;
    }

    // 3. user 검증 + 24h 가드 + token-share dedup
    interface Sendable {
      uid: string;
      token: string;
      targetPrice: number;
    }
    const now = Date.now();
    const sendables: Sendable[] = [];
    const sentTokens = new Set<string>();
    const skip = {
      noUser: 0,
      otherApp: 0,
      noToken: 0,
      notifOff: 0,
      guard24h: 0,
      sameToken: 0,
    };

    for (const c of candidates) {
      try {
        const userSnap = await adminDb.collection('users').doc(c.uid).get();
        if (!userSnap.exists) {
          skip.noUser++;
          continue;
        }
        const user = userSnap.data() ?? {};
        if (user.app !== 'jigumiya') {
          skip.otherApp++;
          continue;
        }
        const token = user.expoPushToken as string | undefined;
        if (!token || !Expo.isExpoPushToken(token)) {
          skip.noToken++;
          continue;
        }
        if (user.notificationEnabled === false) {
          skip.notifOff++;
          continue;
        }
        const lastNotif = user.lastNotifications ?? {};
        const last = Number(lastNotif.targetReached?.[productId] ?? 0);
        if (last > 0 && now - last < ONE_DAY_MS) {
          skip.guard24h++;
          continue;
        }
        if (sentTokens.has(token)) {
          skip.sameToken++;
          continue;
        }
        sentTokens.add(token);
        sendables.push({ uid: c.uid, token, targetPrice: c.targetPrice });
      } catch (e) {
        logger.warn('[realPrice] user 조회 실패', {
          uid: c.uid,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logger.info('[realPrice] 발송 대상', {
      productId,
      sendCount: sendables.length,
      skip,
    });

    // 4. Expo push 발송 + lastNotifications 마킹
    if (sendables.length > 0) {
      const messages: ExpoPushMessage[] = sendables.map((s) => {
        const m = pickRandom(TARGET_REACHED_MESSAGES);
        return {
          to: s.token,
          sound: 'default',
          title: m.title,
          body: `${productName.slice(0, 20)} ${previousPrice.toLocaleString()}원 → ${afterReal.toLocaleString()}원 🎯`,
          data: {
            screen: 'detail',
            itemId: productId,
            alertType: 'target_reached',
          },
        };
      });

      const successfulTokens = new Set<string>();
      const chunks = expoClient.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          const tickets = await expoClient.sendPushNotificationsAsync(chunk);
          tickets.forEach((ticket, i) => {
            const m = chunk[i];
            const tok =
              typeof m?.to === 'string'
                ? m.to
                : Array.isArray(m?.to)
                  ? m.to[0]
                  : '';
            if (ticket.status === 'ok' && tok) successfulTokens.add(tok);
            else if (ticket.status === 'error') {
              logger.warn('[realPrice] push ticket error', {
                token: tok?.slice(0, 30),
                error: ticket.details?.error,
                message: ticket.message,
              });
            }
          });
        } catch (e) {
          logger.error('[realPrice] push batch 실패', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // 성공 토큰의 uid만 24h 가드 박기
      const winners = sendables.filter((s) => successfulTokens.has(s.token));
      await Promise.all(
        winners.map((s) =>
          adminDb
            .collection('users')
            .doc(s.uid)
            .update({
              [`lastNotifications.targetReached.${productId}`]: now,
            })
            .catch((e) =>
              logger.warn('[realPrice] lastNotif 마킹 실패', {
                uid: s.uid,
                error: e instanceof Error ? e.message : String(e),
              }),
            ),
        ),
      );

      logger.info('[realPrice] 발송 완료', {
        productId,
        attempted: sendables.length,
        successful: successfulTokens.size,
        marked: winners.length,
      });
    }

    // 5. needsCheck 클리어
    await clearNeedsCheck(productId, after);
  },
);

export const resolveAndGenerateAffiliateUrl = onCall(
  {
    region: 'asia-northeast3',
    secrets: [COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY],
    cors: true,
    // 2026-05-05: 콜드 스타트 제거를 위해 인스턴스 1개 상시 유지 (월 ~$5~10).
    // 1.0.10 응답시간 로그로 콜드 스파이크 확인 → Android 첫 호출 딜레이 + iOS 공유 무한로딩 위험 감소.
    minInstances: 1,
  },
  async (request): Promise<ResolveResult> => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Firebase Auth required',
      );
    }

    const { sharedUrl } = (request.data ?? {}) as { sharedUrl?: string };
    logger.info('[entry]', { sharedUrl, uid: request.auth.uid });

    if (!sharedUrl || typeof sharedUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'sharedUrl is required');
    }
    if (!sharedUrl.includes('coupang.com')) {
      return { ok: false, error: 'invalid_url', detail: 'not a coupang URL' };
    }

    const accessKey = COUPANG_ACCESS_KEY.value().trim();
    const secretKey = COUPANG_SECRET_KEY.value().trim();
    if (!accessKey || !secretKey) {
      return {
        ok: false,
        error: 'config_missing',
        detail: 'coupang keys missing',
      };
    }

    let resolvedUrl = sharedUrl;
    if (sharedUrl.includes('link.coupang.com')) {
      try {
        const resolved = await resolveRedirectChain(sharedUrl);
        if (!resolved) {
          return {
            ok: false,
            error: 'resolve_failed',
            detail: 'no product URL in redirect chain',
          };
        }
        resolvedUrl = resolved;
      } catch (e) {
        logger.error('[resolve] exception', {
          detail: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
        });
        return {
          ok: false,
          error: 'resolve_failed',
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    }

    try {
      // 1.0.19 §1 — deeplink 호출과 vp 메타데이터 fetch를 병렬화하여 응답시간 절감.
      // 메타데이터 실패는 main flow를 막지 않음 (fetchVpMetadata 내부에서 empty 반환).
      const [deepLink, metadata] = await Promise.all([
        callDeeplinkApi(resolvedUrl, accessKey, secretKey),
        fetchVpMetadata(resolvedUrl),
      ]);
      if (!deepLink) {
        return {
          ok: false,
          error: 'deeplink_failed',
          detail: 'rCode not 0 or empty data',
        };
      }
      logger.info('[exit] ok', {
        input: sharedUrl,
        resolvedUrl,
        shortenUrl: deepLink.shortenUrl,
        hasMetadata:
          !!metadata.productName ||
          !!metadata.productImage ||
          metadata.apiPrice > 0,
      });
      return {
        ok: true,
        shortenUrl: deepLink.shortenUrl,
        originalUrl: deepLink.originalUrl,
        productName: metadata.productName,
        productImage: metadata.productImage,
        apiPrice: metadata.apiPrice,
      };
    } catch (e) {
      logger.error('[deeplink] exception', {
        detail: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
      });
      return {
        ok: false,
        error: 'deeplink_failed',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  },
);
