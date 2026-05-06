/**
 * 1회성 인스펙션 — users 컬렉션 dump.
 *   - app === 'jigumiya' uid 목록 + expoPushToken (전체 + 마스킹)
 *   - token 중복 그룹 (5/6 morning_greeting 4건 사고 원인 특정)
 *   - app 필드 미설정/unknown uid 최근 생성순
 *
 * 실행:
 *   FIREBASE_SERVICE_ACCOUNT_KEY=$(cat /Users/byoungtaeklee/jigumiya/builds/jigumiya-firebase-adminsdk-fbsvc-14daa5f617.json) \
 *     node scripts/cleanup/inspect-users-20260506.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyEnv) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY env required');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(keyEnv)) });
const db = getFirestore();

function maskToken(token) {
  if (!token) return '<no-token>';
  // ExponentPushToken[ABCDEFGHIJKLMNOPQRSTUVWX] (24자) → ExponentPushToken[ABCD…UVWX]
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
  if (v.toDate) return v.toDate().toISOString();
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  return String(v);
}

const snap = await db.collection('users').get();

const allDocs = [];
for (const d of snap.docs) {
  const x = d.data() ?? {};
  allDocs.push({
    uid: d.id,
    app: x.app ?? null,
    token: x.expoPushToken ?? null,
    notifEnabled: x.notificationEnabled,
    createdAt: x.createdAt ?? null,
    lastNotifications: x.lastNotifications ?? null,
    email: x.email ?? null,
    displayName: x.displayName ?? null,
    deviceId: x.deviceId ?? null,
    platform: x.platform ?? null,
  });
}

console.log(`[total] users docs: ${allDocs.length}`);

// 1. app === 'jigumiya' uid 목록
const jigumiya = allDocs.filter((u) => u.app === 'jigumiya');
console.log(`\n=== 1. app='jigumiya' uid (${jigumiya.length}) ===`);
for (const u of jigumiya.sort((a, b) => (a.uid > b.uid ? 1 : -1))) {
  const tokenStr = u.token ? maskToken(u.token) : '<NO TOKEN>';
  const notif = u.notifEnabled === false ? ' notif=OFF' : '';
  const platform = u.platform ? ` platform=${u.platform}` : '';
  const created = u.createdAt ? ` created=${fmtTs(u.createdAt)}` : '';
  console.log(`  ${u.uid}  ${tokenStr}${notif}${platform}${created}`);
}

// 2. token 중복 그룹
console.log(`\n=== 2. token 중복 그룹 (jigumiya only, token 보유) ===`);
const tokenMap = new Map();
for (const u of jigumiya) {
  if (!u.token) continue;
  if (!tokenMap.has(u.token)) tokenMap.set(u.token, []);
  tokenMap.get(u.token).push(u);
}
const dups = [...tokenMap.entries()].filter(([, list]) => list.length > 1);
if (dups.length === 0) {
  console.log('  (없음)');
} else {
  for (const [token, list] of dups) {
    console.log(`\n  TOKEN ${maskToken(token)} — ${list.length} uid:`);
    for (const u of list.sort((a, b) => (a.uid > b.uid ? 1 : -1))) {
      const notif = u.notifEnabled === false ? ' notif=OFF' : '';
      const platform = u.platform ? ` platform=${u.platform}` : '';
      const created = u.createdAt ? ` created=${fmtTs(u.createdAt)}` : '';
      const morningKst =
        u.lastNotifications?.morningKstDate ?? '<no morningKstDate>';
      console.log(
        `    ${u.uid}${notif}${platform}${created} morningKstDate=${morningKst}`,
      );
    }
  }
}

// 3. token 보유 uid 중 platform 정보가 있는 경우 분포
console.log(`\n=== 3. platform 분포 (jigumiya, token 보유) ===`);
const platformCount = {};
for (const u of jigumiya) {
  if (!u.token) continue;
  const p = u.platform ?? '<unset>';
  platformCount[p] = (platformCount[p] ?? 0) + 1;
}
console.log(' ', JSON.stringify(platformCount));

// 4. token 없는 jigumiya uid
const noToken = jigumiya.filter((u) => !u.token);
console.log(
  `\n=== 4. jigumiya uid 중 expoPushToken 없는 doc (${noToken.length}) ===`,
);
for (const u of noToken.sort((a, b) => (a.uid > b.uid ? 1 : -1))) {
  console.log(`  ${u.uid} created=${fmtTs(u.createdAt)}`);
}

// 5. app 필드 미설정/unknown — createdAt 최근 10개
const unknown = allDocs.filter((u) => u.app == null);
console.log(`\n=== 5. app 필드 미설정 uid (${unknown.length}) — 최근 10개 ===`);
const unknownSorted = unknown
  .map((u) => {
    let ts = 0;
    if (u.createdAt) {
      if (typeof u.createdAt === 'number') ts = u.createdAt;
      else if (u.createdAt.toDate) ts = u.createdAt.toDate().getTime();
      else if (u.createdAt._seconds) ts = u.createdAt._seconds * 1000;
    }
    return { ...u, ts };
  })
  .sort((a, b) => b.ts - a.ts);
for (const u of unknownSorted.slice(0, 10)) {
  const tokenStr = u.token ? maskToken(u.token) : '<NO TOKEN>';
  const platform = u.platform ? ` platform=${u.platform}` : '';
  console.log(
    `  ${u.uid} created=${fmtTs(u.createdAt)}${platform} token=${tokenStr}`,
  );
}

// 6. 'aigo' 분포 요약
const aigo = allDocs.filter((u) => u.app === 'aigo');
console.log(
  `\n=== 6. 요약 ===\n  jigumiya=${jigumiya.length} aigo=${aigo.length} unknown=${unknown.length}`,
);

process.exit(0);
