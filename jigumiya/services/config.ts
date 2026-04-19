import { setCoupangApiKeys, hasCoupangApiKeys } from './coupangApi';

/** 앱 시작 시 호출 — EAS Secrets에서 쿠팡 파트너스 API 키 초기화 */
export function initCoupangApi() {
  const accessKey = process.env.EXPO_PUBLIC_COUPANG_ACCESS_KEY || '';
  const secretKey = process.env.EXPO_PUBLIC_COUPANG_SECRET_KEY || '';

  if (accessKey && secretKey) {
    setCoupangApiKeys(accessKey, secretKey);
    console.log('[Config] 쿠팡 파트너스 API 키 로드 완료');
  } else {
    console.log('[Config] 쿠팡 파트너스 API 키 없음 (EAS Secrets 미설정)');
  }
}

export { hasCoupangApiKeys };

/** 홈 가격 추적 상품 최대 개수 (Phase 3 §4) */
export const MAX_TRACKED_ITEMS = 10;

// 스토어 링크 (출시 후 업데이트)
export const STORE_LINKS = {
  ios: '', // App Store URL
  android: '', // Google Play URL
};

export function getAppShareMessage(): string {
  const links = [STORE_LINKS.ios, STORE_LINKS.android].filter(Boolean);
  const linkText = links.length > 0 ? `\n\n${links.join('\n')}` : '';
  return `쿠팡 가격 추적 앱 '지금이야'를 써보세요!\n원하는 가격에 알려주는 스마트 알림 📉${linkText}`;
}
