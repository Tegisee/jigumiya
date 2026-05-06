/**
 * 1회성 인스펙션 — 갤럭시 S21+ uid 추적.
 *   - 15개 jigumiya uid (wnFk 토큰 제외) lastNotifications 상세 + Auth creationTime
 *   - unknown 110개 중 최근 생성된 uid (Auth creationTime asc) — 갤럭시 익명 등록 의심
 *
 * 실행:
 *   FIREBASE_SERVICE_ACCOUNT_KEY=$(cat .../jigumiya-firebase-adminsdk-fbsvc-14daa5f617.json) \
 *     node scripts/cleanup/inspect-galaxy-20260506.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyEnv) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY env required');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(keyEnv)) });
const db = getFirestore();
const auth = getAuth();

const IPHONE_TOKEN_PREFIX = 'ExponentPushToken[wnFk';

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
  if (v == null) return '<n/a>';
  if (typeof v === 'number') return new Date(v).toISOString();
  if (v.toDate) return v.toDate().toISOString();
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  return String(v);
}

function tsMs(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (v.toDate) return v.toDate().getTime();
  if (v._seconds) return v._seconds * 1000;
  return 0;
}

/** Firebase Auth metadata에서 creationTime / lastSignInTime 조회 */
async function fetchAuthMeta(uids) {
  const result = new Map();
  // Auth getUsers: 100건씩 배치
  for (let i = 0; i < uids.length; i += 100) {
    const batch = uids.slice(i, i + 100).map((uid) => ({ uid }));
    try {
      const r = await auth.getUsers(batch);
      for (const u of r.users) {
        result.set(u.uid, {
          creationTime: u.metadata.creationTime,
          lastSignInTime: u.metadata.lastSignInTime,
          providerIds: u.providerData.map((p) => p.providerId).join(',') || 'none',
          email: u.email ?? null,
        });
      }
      // notFound는 result에 없음
    } catch (e) {
      console.warn('  [auth] batch 조회 실패:', e.message);
    }
  }
  return result;
}

const snap = await db.collection('users').get();
const allDocs = [];
for (const d of snap.docs) {
  const x = d.data() ?? {};
  allDocs.push({ uid: d.id, data: x });
}

const jigumiya = allDocs.filter((u) => u.data.app === 'jigumiya');
const unknown = allDocs.filter((u) => u.data.app == null);

const jigumiyaIPhone = jigumiya.filter(
  (u) => (u.data.expoPushToken ?? '').startsWith(IPHONE_TOKEN_PREFIX),
);
const jigumiyaNonIPhone = jigumiya.filter(
  (u) => !(u.data.expoPushToken ?? '').startsWith(IPHONE_TOKEN_PREFIX),
);

console.log(
  `[total] users=${allDocs.length} jigumiya=${jigumiya.length} (iphone=${jigumiyaIPhone.length} non-iphone=${jigumiyaNonIPhone.length}) unknown=${unknown.length}`,
);

// === Auth metadata 일괄 조회 ===
console.log('\n[auth] Firebase Auth metadata 조회 중…');
const allUidsToCheck = [
  ...jigumiyaNonIPhone.map((u) => u.uid),
  ...unknown.map((u) => u.uid),
];
const authMeta = await fetchAuthMeta(allUidsToCheck);
console.log(`[auth] ${authMeta.size}/${allUidsToCheck.length} 건 메타 수신`);

// === 1. jigumiya 비-아이폰 15개 상세 ===
console.log(
  `\n=== 1. jigumiya 비-아이폰 (${jigumiyaNonIPhone.length}) — Auth creationTime desc ===`,
);
const jigumiyaNonIPhoneSorted = jigumiyaNonIPhone
  .map((u) => ({
    ...u,
    auth: authMeta.get(u.uid),
    authCreatedMs: authMeta.get(u.uid)
      ? new Date(authMeta.get(u.uid).creationTime).getTime()
      : 0,
  }))
  .sort((a, b) => b.authCreatedMs - a.authCreatedMs);

for (const u of jigumiyaNonIPhoneSorted) {
  const x = u.data;
  const tokenStr = maskToken(x.expoPushToken);
  const morning = x.lastNotifications?.morningKstDate ?? '<no morningKstDate>';
  const evening = x.lastNotifications?.eveningKstDate ?? '<no eveningKstDate>';
  const dropKeys = Object.keys(x.lastNotifications?.priceDrop ?? {});
  const upKeys = Object.keys(x.lastNotifications?.priceUp ?? {});
  const targetKeys = Object.keys(x.lastNotifications?.targetReached ?? {});
  // 가장 최근 lastNotifications 활동 시각
  const allLastTs = [
    ...Object.values(x.lastNotifications?.priceDrop ?? {}),
    ...Object.values(x.lastNotifications?.priceUp ?? {}),
    ...Object.values(x.lastNotifications?.targetReached ?? {}),
  ].filter((v) => typeof v === 'number');
  const maxLastNotif = allLastTs.length > 0 ? Math.max(...allLastTs) : 0;
  const authStr = u.auth
    ? `created=${u.auth.creationTime} lastSignIn=${u.auth.lastSignInTime} provider=${u.auth.providerIds}${u.auth.email ? ' email=' + u.auth.email : ''}`
    : '<auth not found>';
  console.log(
    `\n  ${u.uid}\n    token=${tokenStr}\n    morning=${morning} evening=${evening}\n    drop=${dropKeys.length}건 up=${upKeys.length}건 target=${targetKeys.length}건  lastNotifActivity=${maxLastNotif ? new Date(maxLastNotif).toISOString() : '<n/a>'}\n    auth: ${authStr}`,
  );
}

// === 2. unknown 110 중 최근 생성 — Auth creationTime desc top 20 ===
console.log(`\n=== 2. unknown 최근 생성 (Auth creationTime desc top 20) ===`);
const unknownWithAuth = unknown
  .map((u) => ({
    ...u,
    auth: authMeta.get(u.uid),
    authCreatedMs: authMeta.get(u.uid)
      ? new Date(authMeta.get(u.uid).creationTime).getTime()
      : 0,
  }))
  .filter((u) => u.auth)
  .sort((a, b) => b.authCreatedMs - a.authCreatedMs);

for (const u of unknownWithAuth.slice(0, 20)) {
  const x = u.data;
  const tokenStr = maskToken(x.expoPushToken);
  const provider = u.auth.providerIds;
  const email = u.auth.email ? ` email=${u.auth.email}` : '';
  console.log(
    `  ${u.uid}\n    created=${u.auth.creationTime} lastSignIn=${u.auth.lastSignInTime} provider=${provider}${email}\n    token=${tokenStr}`,
  );
}

console.log(
  `\n  (auth meta 없는 unknown: ${unknown.length - unknownWithAuth.length}건 — 이미 deleted)`,
);

process.exit(0);
