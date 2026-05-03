/**
 * 1회성 정리 스크립트 — 2026-05-03 07:40 KST shared-price-check.yml run 25263678929에서
 * Expo batch 거절(다른 EAS projectId 토큰 혼재)로 푸시 0건 발송됐으나, 코드 버그(markUpdate가
 * send 전에 호출됨)로 `users/{uid}.lastNotifications.morning`이 무차별 박혀 후속 cron에서
 * 24h 가드 차단 → 알림 0건 사고. 해당 timestamp 범위에 박힌 morning 가드를 unset.
 *
 * 환경 변수:
 *   FIREBASE_SERVICE_ACCOUNT_KEY  — 서비스 계정 JSON 문자열 (필수)
 *   DRY_RUN                       — "false" 면 실제 적용, 그 외 dry-run (기본 true)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyEnv) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY env required');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(keyEnv)) });
const db = getFirestore();

const DRY_RUN = (process.env.DRY_RUN ?? 'true') !== 'false';

// run 25263678929 발송 시도 시각: 2026-05-02 22:47:14 UTC = 07:47:14 KST 5/3.
// 안전 마진: 22:30 ~ 23:30 UTC (= 07:30 ~ 08:30 KST). 정상 발송 successfulTokens는 fix 후 코드에서만 마킹되므로
// 본 범위에 박힌 값은 모두 잘못 박힌 가드로 간주.
const TARGET_TS_START = Date.UTC(2026, 4, 2, 22, 30, 0); // 22:30 UTC
const TARGET_TS_END = Date.UTC(2026, 4, 2, 23, 30, 0);   // 23:30 UTC

async function main() {
  console.log(`[cleanup] DRY_RUN=${DRY_RUN}`);
  console.log(
    `[cleanup] morning timestamp 범위: ${new Date(
      TARGET_TS_START,
    ).toISOString()} ~ ${new Date(TARGET_TS_END).toISOString()}`,
  );

  const snap = await db.collection('users').get();
  let scanned = 0;
  let candidates = 0;
  let updated = 0;
  let outOfRange = 0;
  let noField = 0;

  for (const u of snap.docs) {
    scanned++;
    const data = u.data();
    const morningTs = data?.lastNotifications?.morning as number | undefined;
    if (typeof morningTs !== 'number') {
      noField++;
      continue;
    }
    if (morningTs < TARGET_TS_START || morningTs > TARGET_TS_END) {
      outOfRange++;
      continue;
    }

    candidates++;
    const tokenSlice = (data?.expoPushToken as string | undefined)?.slice(0, 30) ?? 'no-token';
    console.log(
      `  [후보 ${candidates}] uid=${u.id} morning=${new Date(morningTs).toISOString()} token=${tokenSlice}`,
    );

    if (DRY_RUN) continue;

    try {
      await u.ref.update({
        'lastNotifications.morning': FieldValue.delete(),
      });
      updated++;
    } catch (e) {
      console.warn(`  [실패] uid=${u.id}:`, e);
    }
  }

  console.log(
    `\n[cleanup] 완료 scanned=${scanned} noField=${noField} outOfRange=${outOfRange} candidates=${candidates} updated=${updated} dry=${DRY_RUN}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
