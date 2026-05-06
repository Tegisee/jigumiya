import { Platform } from 'react-native';
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
  ios: 'https://apps.apple.com/app/id6760587430',
  android: 'https://play.google.com/store/apps/details?id=com.jigumiya.app',
};

/** 플랫폼별 단일 스토어 링크 — 공유 메시지에서 한 줄만 노출 */
export function getStoreLinkForPlatform(): string {
  return Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;
}

export function getAppShareMessage(): string {
  const link = getStoreLinkForPlatform();
  const linkText = link ? `\n\n${link}` : '';
  return `쿠팡 가격 추적 앱 '지금이야'를 써보세요!\n원하는 가격에 알려주는 스마트 알림 📉${linkText}`;
}
