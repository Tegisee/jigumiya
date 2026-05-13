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

/** 추적중 탭 가격 추적 상품 최대 개수 (1.0.17 10 → 20 상향, §앱구조 개편) */
export const MAX_TRACKED_ITEMS = 20;

// 스토어 링크 (출시 후 업데이트)
export const STORE_LINKS = {
  ios: 'https://apps.apple.com/app/id6760587430',
  android: 'https://play.google.com/store/apps/details?id=com.jigumiya.app',
};

/** 플랫폼별 단일 스토어 링크 — 호출처 없을 시 제거 예정. 호환용 유지. */
export function getStoreLinkForPlatform(): string {
  return Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;
}

/**
 * 앱 공유 메시지 — 1.0.17: 어느 기기에서 공유하든 App Store + Google Play 양쪽 링크 포함.
 * 받는 사람이 본인 기기에 맞는 링크를 직접 선택. iPhone 사용자가 안드로이드 친구에게 공유해도 정상 동작.
 */
export function getAppShareMessage(): string {
  return [
    `쿠팡 가격 추적 앱 '지금이야'를 써보세요!`,
    `원하는 가격에 알려주는 스마트 알림 📉`,
    ``,
    `iPhone: ${STORE_LINKS.ios}`,
    ``,
    `Android: ${STORE_LINKS.android}`,
  ].join('\n');
}
