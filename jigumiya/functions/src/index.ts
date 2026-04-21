import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createHmac } from 'crypto';

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
  | { ok: true; shortenUrl: string; originalUrl: string }
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

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    if (visited.has(currentUrl)) {
      throw new Error('redirect_loop');
    }
    visited.add(currentUrl);

    if (isProductUrl(currentUrl)) {
      return currentUrl;
    }

    const res = await fetchWithRetry(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': SAFARI_IPHONE_UA },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    break;
  }

  return isProductUrl(currentUrl) ? currentUrl : null;
}

async function callDeeplinkApi(
  originalUrl: string,
  accessKey: string,
  secretKey: string,
): Promise<{ shortenUrl: string; originalUrl: string } | null> {
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

  const json = (await res.json()) as {
    rCode?: string;
    rMessage?: string;
    data?: Array<{ shortenUrl?: string; originalUrl?: string }>;
  };

  if (json.rCode === '0' && json.data?.[0]?.shortenUrl) {
    return {
      shortenUrl: json.data[0].shortenUrl,
      originalUrl: json.data[0].originalUrl ?? originalUrl,
    };
  }

  console.warn(
    '[resolveAffiliate] deeplink rCode:',
    json.rCode,
    'rMessage:',
    json.rMessage,
  );
  return null;
}

export const resolveAndGenerateAffiliateUrl = onCall(
  {
    region: 'asia-northeast3',
    secrets: [COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY],
    cors: true,
  },
  async (request): Promise<ResolveResult> => {
    const { sharedUrl } = (request.data ?? {}) as { sharedUrl?: string };

    if (!sharedUrl || typeof sharedUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'sharedUrl is required');
    }
    if (!sharedUrl.includes('coupang.com')) {
      return { ok: false, error: 'invalid_url', detail: 'not a coupang URL' };
    }

    const accessKey = COUPANG_ACCESS_KEY.value();
    const secretKey = COUPANG_SECRET_KEY.value();
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
        return {
          ok: false,
          error: 'resolve_failed',
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    }

    try {
      const deepLink = await callDeeplinkApi(resolvedUrl, accessKey, secretKey);
      if (!deepLink) {
        return {
          ok: false,
          error: 'deeplink_failed',
          detail: 'rCode not 0 or empty data',
        };
      }
      return {
        ok: true,
        shortenUrl: deepLink.shortenUrl,
        originalUrl: deepLink.originalUrl,
      };
    } catch (e) {
      return {
        ok: false,
        error: 'deeplink_failed',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  },
);
