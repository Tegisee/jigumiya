import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
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

export const resolveAndGenerateAffiliateUrl = onCall(
  {
    region: 'asia-northeast3',
    secrets: [COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY],
    cors: true,
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
      const deepLink = await callDeeplinkApi(resolvedUrl, accessKey, secretKey);
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
      });
      return {
        ok: true,
        shortenUrl: deepLink.shortenUrl,
        originalUrl: deepLink.originalUrl,
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
