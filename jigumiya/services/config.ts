import { setCoupangApiKeys } from './coupangApi';

/** 앱 시작 시 호출 - API 키 초기화 */
export function initCoupangApi() {
  // TODO: .env 또는 EAS Secrets에서 키 주입
  // expo-constants의 expoConfig.extra에서 읽거나
  // 직접 하드코딩 (개발용만, 배포 시 반드시 환경변수 사용)
  const accessKey = process.env.EXPO_PUBLIC_COUPANG_ACCESS_KEY || '';
  const secretKey = process.env.EXPO_PUBLIC_COUPANG_SECRET_KEY || '';

  if (accessKey && secretKey) {
    setCoupangApiKeys(accessKey, secretKey);
    console.log('[Config] 쿠팡 파트너스 API 키 설정 완료');
  } else {
    console.log('[Config] 쿠팡 파트너스 API 키 미설정 - 딥링크 변환 비활성화');
  }
}
