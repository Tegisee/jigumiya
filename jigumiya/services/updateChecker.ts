import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getMetaConfig } from './firebase';

const DISMISSED_VERSION_KEY = 'update_prompt_dismissed_version';
const ANDROID_PACKAGE = 'com.jigumiya.app';
const IOS_APP_STORE_ID = '6760587430';

/** "1.0.6" vs "1.0.10" semver 부분 비교. 음수/0/양수 반환. */
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function getCurrentVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

function getStoreUrls(): { primary: string; fallback: string } {
  if (Platform.OS === 'android') {
    return {
      primary: `market://details?id=${ANDROID_PACKAGE}`,
      fallback: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
    };
  }
  if (!IOS_APP_STORE_ID) return { primary: '', fallback: '' };
  return {
    primary: `itms-apps://itunes.apple.com/app/id${IOS_APP_STORE_ID}`,
    fallback: `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`,
  };
}

async function openStore(): Promise<void> {
  const { primary, fallback } = getStoreUrls();
  if (primary) {
    try {
      const can = await Linking.canOpenURL(primary);
      if (can) {
        await Linking.openURL(primary);
        return;
      }
    } catch {}
  }
  if (fallback) {
    try {
      await Linking.openURL(fallback);
    } catch (e) {
      console.warn('[update] 스토어 열기 실패:', e);
    }
  }
}

/**
 * 업데이트 알림 체크 — 앱 첫 마운트 시 1회 호출.
 *
 * 동작:
 *   1. meta/config_jigumiya에서 minRequiredVersion 조회 (인증 없이)
 *   2. 현재 앱 버전이 minRequiredVersion 이상이면 종료
 *   3. forceUpdate=true → Alert 항상 표시(버튼 1개)
 *      forceUpdate=false → 같은 minRequiredVersion에 대해 "나중에" 누른 적 있으면 스킵
 *   4. 표시 시 두 버튼: [나중에] / [업데이트 하기]
 *
 * 모든 실패는 조용히 스킵 (앱 시작 흐름 차단 방지).
 */
export async function checkForUpdate(): Promise<void> {
  try {
    const current = getCurrentVersion();
    if (!current) return;

    const cfg = await getMetaConfig();
    if (!cfg?.minRequiredVersion) return;

    if (compareVersion(current, cfg.minRequiredVersion) >= 0) return;

    const isForce = cfg.forceUpdate === true;

    if (!isForce) {
      const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
      if (dismissed === cfg.minRequiredVersion) return;
    }

    const title = '새 버전이 출시됐어요';
    const body = cfg.updateMessage
      ? cfg.updateMessage
      : `최신 버전(${cfg.latestVersion ?? cfg.minRequiredVersion})으로 업데이트해주세요.\n현재 버전: ${current}`;

    const buttons: Parameters<typeof Alert.alert>[2] = [];
    if (!isForce) {
      buttons.push({
        text: '나중에',
        style: 'cancel',
        onPress: async () => {
          try {
            await AsyncStorage.setItem(
              DISMISSED_VERSION_KEY,
              cfg.minRequiredVersion,
            );
          } catch {}
        },
      });
    }
    buttons.push({
      text: '업데이트 하기',
      onPress: () => {
        openStore();
      },
    });

    Alert.alert(title, body, buttons, { cancelable: !isForce });
  } catch (e) {
    console.warn('[update] check 실패:', e);
  }
}
