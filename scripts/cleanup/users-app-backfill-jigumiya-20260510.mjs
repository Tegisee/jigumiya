/**
 * 1회성 backfill — Issue 2-C (2026-05-10)
 *
 * 대상: users 컬렉션 중 아래 조건을 모두 만족하는 doc
 *   1. `app` 필드 없음 (== null)
 *   2. `expoPushToken` 보유
 *   3. `tracked` 서브컬렉션 비어있지 않음
 *
 * 동작: 위 doc에 `app: 'jigumiya'` 박기.
 *
 * 배경:
 *   - 5/5 strict 정책(`app === 'jigumiya'` strict)으로 unknown 40명이 cron 발송 대상에서 제외됨
 *   - 1.0.11+ `ensureUserDoc`이 자동으로 박지만 이 기간 앱 미실행자는 영원히 unknown
 *   - 이들 중 tracked 보유자는 가격 변동 알림이 영구 미수신 상태
 *
 * Issue 2-A(`a5dfc5d`)와 결합:
 *   - 백필된 user가 app='jigumiya'로 식별 → fetchActiveUsers 후보 진입
 *   - tracked 보유 조건 자동 통과
 *   - 같은 token을 공유하는 다른 jigumiya user가 있으면 lastNotif winner 정책으로 1개 선정
 *
 * 사용:
 *   dry-run (기본):
 *     FIREBASE_SERVICE_ACCOUNT_KEY=$(cat /Users/byoungtaeklee/jigumiya/builds/jigumiya-firebase-adminsdk-fbsvc-14daa5f617.json) \
 *       node scripts/cleanup/users-app-backfill-jigumiya-20260510.mjs
 *
 *   apply (실제 write):
 *     FIREBASE_SERVICE_ACCOUNT_KEY=... DRY_RUN=false \
 *       node scripts/cleanup/users-app-backfill-jigumiya-20260510.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyEnv) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY env required');
  process.exit(1);
}
const dryRun = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';

initializeApp({ credential: cert(JSON.parse(keyEnv)) });
const db = getFirestore();

function maskToken(token) {
  if (!token) return '<no-token>';
  if (token.startsWith('ExponentPushToken[') && token.endsWith(']')) {
    const inner = token.slice('ExponentPushToken['.length, -1);
    if (inner.length > 8)
      return `ExponentPushToken[${inner.slice(0, 4)}…${inner.slice(-4)}]`;
    return token;
  }
  return token.slice(0, 12) + '…';
}

function fmtTs(v) {
  if (!v) return '<n/a>';
  if (typeof v === 'number') return new Date(v).toISOString();
  if (v?.toDate) return v.toDate().toISOString();
  if (v?._seconds) return new Date(v._seconds * 1000).toISOString();
  return String(v);
}

function maxLastNotifTime(ln) {
  if (!ln) return 0;
  let m = 0;
  if (typeof ln.morning === 'number' && ln.morning > m) m = ln.morning;
  if (typeof ln.evening === 'number' && ln.evening > m) m = ln.evening;
  for (const k of ['priceDrop', 'priceUp', 'targetReached']) {
    const map = ln[k];
    if (!map || typeof map !== 'object') continue;
    for (const v of Object.values(map)) {
      if (typeof v === 'number' && v > m) m = v;
    }
  }
  return m;
}

console.log(`[Backfill] DRY_RUN=${dryRun}${dryRun ? ' (실제 write 안 함)' : ' (실제 write 진행)'}`);
console.log('[Backfill] users 컬렉션 스캔 중…');

const snap = await db.collection('users').get();

const stats = {
  total: snap.size,
  skipAppSet: 0,
  skipNoToken: 0,
  skipNoTracked: 0,
  candidate: 0,
};

const candidates = []; // { uid, token, createdAt, lastNotifTime, notifEnabled }

for (const u of snap.docs) {
  const d = u.data() ?? {};

  if (d.app != null) {
    stats.skipAppSet++;
    continue;
  }
  const token = d.expoPushToken;
  if (!token) {
    stats.skipNoToken++;
    continue;
  }

  // tracked 서브컬렉션 한 doc만 read해서 비어있지 않은지 확인
  const trackedSnap = await db
    .collection('users')
    .doc(u.id)
    .collection('tracked')
    .limit(1)
    .get();
  if (trackedSnap.empty) {
    stats.skipNoTracked++;
    continue;
  }

  stats.candidate++;
  candidates.push({
    uid: u.id,
    token,
    createdAt: d.createdAt ?? null,
    lastNotifTime: maxLastNotifTime(d.lastNotifications),
    notifEnabled: d.notificationEnabled !== false,
  });
}

console.log(`\n=== 스캔 결과 ===`);
console.log(`총 user docs:                ${stats.total}`);
console.log(`스킵 (app 이미 설정):        ${stats.skipAppSet}`);
console.log(`스킵 (token 없음):           ${stats.skipNoToken}`);
console.log(`스킵 (tracked 비어있음):     ${stats.skipNoTracked}`);
console.log(`후보 (backfill 대상):        ${stats.candidate}`);

// jigumiya 사용자와 token 공유 여부 분석 (Issue 2-A winner 정책 영향 미리보기)
const jigumiyaTokens = new Map(); // token → [uid]
for (const u of snap.docs) {
  const d = u.data() ?? {};
  if (d.app !== 'jigumiya') continue;
  const t = d.expoPushToken;
  if (!t) continue;
  if (!jigumiyaTokens.has(t)) jigumiyaTokens.set(t, []);
  jigumiyaTokens.get(t).push(u.id);
}

console.log(`\n=== 후보 상세 (${candidates.length}명) ===`);
candidates.sort((a, b) => b.lastNotifTime - a.lastNotifTime);
for (const c of candidates) {
  const tokenStr = maskToken(c.token);
  const created = fmtTs(c.createdAt);
  const lastN = c.lastNotifTime ? fmtTs(c.lastNotifTime) : '<never>';
  const notif = c.notifEnabled ? '' : ' notif=OFF';
  const sharedWith = jigumiyaTokens.get(c.token) ?? [];
  const sharedNote = sharedWith.length
    ? ` ⚠️ 기존 jigumiya와 token 공유 (${sharedWith.length}명: ${sharedWith.map((x) => x.slice(0, 10)).join(',')})`
    : '';
  console.log(
    `  ${c.uid}  ${tokenStr} created=${created} lastNotif=${lastN}${notif}${sharedNote}`,
  );
}

if (candidates.length === 0) {
  console.log('\n[Backfill] 후보 0명 — 종료');
  process.exit(0);
}

if (dryRun) {
  console.log(
    `\n[Backfill] DRY_RUN 모드 — 실제 write 안 함. 적용하려면 DRY_RUN=false 환경변수 설정 후 재실행.`,
  );
  process.exit(0);
}

console.log(`\n=== 실제 적용 진행 (${candidates.length}명에 app:'jigumiya' 박기) ===`);
let applied = 0;
let failed = 0;
for (const c of candidates) {
  try {
    await db.collection('users').doc(c.uid).update({ app: 'jigumiya' });
    applied++;
    console.log(`  OK ${c.uid}`);
  } catch (e) {
    failed++;
    console.warn(`  FAIL ${c.uid}: ${e.message ?? e}`);
  }
}
console.log(`\n[Backfill] 완료: 적용 ${applied}명 / 실패 ${failed}명`);
process.exit(0);
