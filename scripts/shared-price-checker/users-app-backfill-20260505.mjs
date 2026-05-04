// 1회성 backfill — users 컬렉션에 app 필드 박아주기
//
// 분류 규칙 (우선순위):
//   1. app 필드 이미 있음 → 건드리지 X (스킵)
//   2. AIGO 식별 필드 1개라도 보유 → app: 'aigo'
//   3. JIGUMIYA 서브컬렉션 1개라도 보유 → app: 'jigumiya'
//   4. 둘 다 없음 → app: 'unknown' (발송 제외)
//   * aigo + jigumiya 단서 동시 보유 → aigo 우선 (사용자 사양 순서)
//
// 사용:
//   dry-run:  node users-app-backfill-20260505.mjs <service-account-json>
//   apply:    node users-app-backfill-20260505.mjs <service-account-json> --apply

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saPath = process.argv[2];
const dryRun = process.argv[3] !== '--apply';

if (!saPath) {
  console.error(
    'Usage: node users-app-backfill-20260505.mjs <service-account-json> [--apply]',
  );
  process.exit(1);
}

const AIGO_FIELDS = [
  'vaccinationRecords',
  'vaccinationHospitals',
  'children',
  'selectedChildId',
  'babyName',
  'babyGender',
  'babyBirthDate',
  'parentInfo',
];
const JIGUMIYA_SUBCOLLECTIONS = ['items', 'tracked', 'favorites'];

const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('users').get();

const stats = {
  total: 0,
  alreadySet: 0,
  classifiedAigo: 0,
  classifiedJigumiya: 0,
  classifiedUnknown: 0,
  bothFlags: 0,
};

const updates = []; // { uid, app, reason, hasToken, lastActiveAt, hasLastNotif }

for (const u of snap.docs) {
  stats.total++;
  const d = u.data();
  const hasToken = !!d.expoPushToken;
  const lastActiveAt = d.lastActiveAt;
  const hasLastNotif = !!d.lastNotifications;

  if (d.app != null) {
    stats.alreadySet++;
    continue;
  }

  const matchedAigoFields = AIGO_FIELDS.filter((f) => d[f] != null);
  const hasAigoFlag = matchedAigoFields.length > 0;

  const subCheck = await Promise.all(
    JIGUMIYA_SUBCOLLECTIONS.map((sc) =>
      db.collection('users').doc(u.id).collection(sc).limit(1).get(),
    ),
  );
  const matchedSubs = JIGUMIYA_SUBCOLLECTIONS.filter(
    (_, i) => !subCheck[i].empty,
  );
  const hasJigumiyaSub = matchedSubs.length > 0;

  let app;
  let reason;

  if (hasAigoFlag && hasJigumiyaSub) {
    stats.bothFlags++;
    app = 'aigo';
    reason = `both — aigo 필드(${matchedAigoFields.join('/')}) + jigumiya 서브(${matchedSubs.join('/')}) → aigo 우선`;
  } else if (hasAigoFlag) {
    app = 'aigo';
    stats.classifiedAigo++;
    reason = `aigo 필드: ${matchedAigoFields.join(', ')}`;
  } else if (hasJigumiyaSub) {
    app = 'jigumiya';
    stats.classifiedJigumiya++;
    reason = `jigumiya 서브: ${matchedSubs.join(', ')}`;
  } else {
    app = 'unknown';
    stats.classifiedUnknown++;
    reason = `식별 단서 없음 (token=${hasToken})`;
  }

  updates.push({
    uid: u.id,
    app,
    reason,
    hasToken,
    lastActiveAt,
    hasLastNotif,
  });
}

// 통계 출력
console.log('=== 분류 결과 ===');
console.log(`총: ${stats.total}`);
console.log(`이미 app 설정 (스킵): ${stats.alreadySet}`);
console.log(`aigo 분류 (단독): ${stats.classifiedAigo}`);
console.log(`jigumiya 분류: ${stats.classifiedJigumiya}`);
console.log(`unknown 분류: ${stats.classifiedUnknown}`);
console.log(
  `(이 중 aigo+jigumiya 단서 동시 보유: ${stats.bothFlags}명 → aigo로 분류)`,
);
console.log(
  `aigo 합계: ${stats.classifiedAigo + stats.bothFlags} (단독 ${stats.classifiedAigo} + 양쪽 ${stats.bothFlags})`,
);

console.log(`\nDRY_RUN=${dryRun}${dryRun ? ' (실제 write 안 함)' : ' (실제 write 진행)'}`);

// 토큰 보유자 분포 — 알림 발송 영향 핵심
const tokenStats = { aigo: 0, jigumiya: 0, unknown: 0 };
for (const u of updates) {
  if (u.hasToken) tokenStats[u.app]++;
}
console.log(`\n토큰 보유자 분류 분포 (알림 발송 직접 영향):`);
console.log(
  `  aigo:     ${tokenStats.aigo}명 (jigumiya cron 발송 대상에서 제외됨)`,
);
console.log(`  jigumiya: ${tokenStats.jigumiya}명 (jigumiya cron 발송 대상)`);
console.log(
  `  unknown:  ${tokenStats.unknown}명 (jigumiya cron 발송 제외 — 검토 후 발송 정책 결정)`,
);

// 분류별 샘플
console.log(`\n=== 분류별 샘플 ===`);
for (const target of ['aigo', 'jigumiya', 'unknown']) {
  const subset = updates.filter((u) => u.app === target);
  console.log(`\n[${target}] 총 ${subset.length}명, 토큰 보유 ${subset.filter((u) => u.hasToken).length}명. 샘플 8개:`);
  for (const s of subset.slice(0, 8)) {
    console.log(
      `  uid=${s.uid.slice(0, 20)}.. token=${s.hasToken ? 'Y' : 'N'} lastNotif=${s.hasLastNotif ? 'Y' : 'N'} lastActive=${s.lastActiveAt ?? '-'}`,
    );
    console.log(`    → ${s.reason}`);
  }
}

if (dryRun) {
  console.log(
    `\n실제 적용하려면: node users-app-backfill-20260505.mjs ${saPath} --apply`,
  );
  process.exit(0);
}

// 실제 적용 — unknown은 스킵 (1.0.11 배포 후 savePushToken 백필로 자연 회복 대기)
console.log(`\n=== 실제 적용 진행 (unknown은 스킵) ===`);
let applied = 0;
let appliedAigo = 0;
let appliedJigumiya = 0;
let skippedUnknown = 0;
let failed = 0;
for (const u of updates) {
  if (u.app === 'unknown') {
    skippedUnknown++;
    continue;
  }
  try {
    await db.collection('users').doc(u.uid).update({ app: u.app });
    applied++;
    if (u.app === 'aigo') appliedAigo++;
    else if (u.app === 'jigumiya') appliedJigumiya++;
  } catch (e) {
    failed++;
    console.warn(`FAIL ${u.uid}: ${e.message ?? e}`);
  }
}
console.log(
  `적용 완료: ${applied}명 (aigo=${appliedAigo}, jigumiya=${appliedJigumiya}), 실패: ${failed}명, unknown 스킵: ${skippedUnknown}명`,
);
process.exit(0);
