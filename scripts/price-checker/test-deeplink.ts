import { createHmac } from 'crypto';

const BASE_URL = 'https://api-gateway.coupang.com';
const DEEPLINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY || '';
const SECRET_KEY = process.env.COUPANG_SECRET_KEY || '';

function generateAuthorization(method: string, path: string, query: string = ''): string {
  const now = new Date();
  const datetime = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').slice(2);
  const message = datetime + method + path + query;
  const signature = createHmac('sha256', SECRET_KEY).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

async function testDeepLink() {
  const testUrls = [
    'https://link.coupang.com/a/d9bNVD',
    'https://www.coupang.com/vp/products/7769814651?itemId=20972918776&vendorItemId=3000244428',
  ];

  for (const testUrl of testUrls) {
    console.log(`\n--- 테스트 URL: ${testUrl.slice(0, 60)} ---`);
    const authorization = generateAuthorization('POST', DEEPLINK_PATH);
    const body = { coupangUrls: [testUrl] };

    const res = await fetch(`${BASE_URL}${DEEPLINK_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    console.log('rCode:', json.rCode);
    console.log('rMessage:', json.rMessage);
    console.log('data:', JSON.stringify(json.data, null, 2));
  }
}

testDeepLink().catch(console.error);
