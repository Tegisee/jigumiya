import HmacSHA256 from 'crypto-js/hmac-sha256';
import Hex from 'crypto-js/enc-hex';

const BASE_URL = 'https://api-gateway.coupang.com';
const DEEPLINK_PATH =
  '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

// API 키는 .env에서 주입 (없으면 graceful fallback)
let ACCESS_KEY = '';
let SECRET_KEY = '';

export function setCoupangApiKeys(accessKey: string, secretKey: string) {
  ACCESS_KEY = accessKey;
  SECRET_KEY = secretKey;
}

export function hasCoupangApiKeys(): boolean {
  return ACCESS_KEY.length > 0 && SECRET_KEY.length > 0;
}

function generateAuthorization(
  method: string,
  path: string,
  query: string = ''
): string {
  const now = new Date();
  const datetime = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
    .slice(2); // YYMMDDTHHmmSSZ

  const message = datetime + method + path + query;
  const signature = HmacSHA256(message, SECRET_KEY).toString(Hex);

  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

/** 쿠팡 URL → 파트너스 딥링크 변환 */
export async function generateDeepLink(
  originalUrl: string,
  subId?: string
): Promise<{ shortenUrl: string; originalUrl: string } | null> {
  if (!hasCoupangApiKeys()) return null;

  try {
    const authorization = generateAuthorization('POST', DEEPLINK_PATH);
    const body: any = { coupangUrls: [originalUrl] };
    if (subId) body.subId = subId;

    const res = await fetch(`${BASE_URL}${DEEPLINK_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (json.rCode === '0' && json.data?.[0]) {
      return {
        shortenUrl: json.data[0].shortenUrl,
        originalUrl: json.data[0].originalUrl,
      };
    }
    return null;
  } catch (e) {
    console.warn('[CoupangAPI] Deep link 생성 실패:', e);
    return null;
  }
}

