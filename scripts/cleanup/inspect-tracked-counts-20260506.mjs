/**
 * 1회성 인스펙션 — users/{uid}/tracked 서브컬렉션 카운트.
 *   - jigumiya + unknown 전체 uid의 tracked size 집계
 *   - 6개 상품 보유 uid 식별 (갤럭시 S21+ 후보 매칭)
 *
 * 실행:
 *   FIREBASE_SERVICE_ACCOUNT_KEY=$(cat .../jigumiya-firebase-adminsdk-fbsvc-14daa5f617.json) \
 *     node scripts/cleanup/inspect-tracked-counts-20260506.mjs
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

function maskToken(token) {
  if (!token) return '<no-token>';
  if (token.startsWith('ExponentPushToken[') && token.endsWith(']')) {
    const inner = token.slice('ExponentPushToken['.length, -1);
    if (inner.length > 8)
      return `ExponentPushToken[${inner.slice(0, 4)}…${inner.slice(-4)}]`;
  }
  return token.slice(0, 12) + '…';
}

// 1) collectionGroup('tracked')로 일괄 fetch → uid별 카운트
console.log('[step1] collectionGroup(tracked) 스캔…');
const trackedSnap = await db.collectionGroup('tracked').get();
console.log(`  tracked docs total: ${trackedSnap.size}`);

const tracksByUid = new Map(); // uid → [productId, ...]
for (const d of trackedSnap.docs) {
  // path: users/{uid}/tracked/{productId}
  const parts = d.ref.path.split('/');
  if (parts.length < 4 || parts[0] !== 'users' || parts[2] !== 'tracked') continue;
  const uid = parts[1];
  if (!tracksByUid.has(uid)) tracksByUid.set(uid, []);
  tracksByUid.get(uid).push({ productId: parts[3], data: d.data() });
}
console.log(`  unique uids with tracked: ${tracksByUid.size}`);

// 2) users 컬렉션 fetch → app 필드 + token 매칭
console.log('\n[step2] users 컬렉션 fetch…');
const usersSnap = await db.collection('users').get();
const userByUid = new Map();
for (const u of usersSnap.docs) {
  userByUid.set(u.id, u.data() ?? {});
}

// 3) jigumiya + unknown만 필터, tracked 카운트 desc 정렬
const targets = [];
for (const [uid, tracks] of tracksByUid) {
  const ud = userByUid.get(uid);
  if (!ud) {
    targets.push({ uid, app: '<no user doc>', count: tracks.length, tracks, ud: null });
    continue;
  }
  const app = ud.app ?? null;
  if (app === 'jigumiya' || app == null) {
    targets.push({ uid, app: app ?? '<unset>', count: tracks.length, tracks, ud });
  }
}
targets.sort((a, b) => b.count - a.count);

console.log(`\n[step3] jigumiya+unknown tracked 보유 uid: ${targets.length}건`);

// 4) Auth metadata 조회 (top 후보들)
console.log('\n[step4] Auth metadata 조회…');
const authMeta = new Map();
for (let i = 0; i < targets.length; i += 100) {
  const batch = targets.slice(i, i + 100).map((t) => ({ uid: t.uid }));
  try {
    const r = await auth.getUsers(batch);
    for (const u of r.users) authMeta.set(u.uid, u.metadata);
  } catch (e) {
    console.warn('  auth batch 실패:', e.message);
  }
}

// 5) 결과 출력 — count desc, count >= 1 모두
console.log(`\n=== tracked 카운트 분포 (jigumiya + unknown) ===`);
const distribution = {};
for (const t of targets) {
  distribution[t.count] = (distribution[t.count] ?? 0) + 1;
}
console.log(' ', JSON.stringify(distribution));

console.log(`\n=== 상세 (count desc) ===`);
for (const t of targets) {
  const meta = authMeta.get(t.uid);
  const created = meta ? meta.creationTime : '<no auth>';
  const tokenStr = maskToken(t.ud?.expoPushToken);
  const morning = t.ud?.lastNotifications?.morningKstDate ?? '<n/a>';
  console.log(
    `  ${t.uid}  count=${t.count}  app=${t.app}  token=${tokenStr}  morning=${morning}  created=${created}`,
  );
}

// 6) count === 6 인 uid 강조
const six = targets.filter((t) => t.count === 6);
console.log(`\n=== 🎯 count === 6 (${six.length}건) ===`);
for (const t of six) {
  const meta = authMeta.get(t.uid);
  console.log(
    `\n  uid=${t.uid}\n    app=${t.app}\n    token=${t.ud?.expoPushToken ?? '<none>'}\n    created=${meta?.creationTime ?? '<n/a>'}\n    lastSignIn=${meta?.lastSignInTime ?? '<n/a>'}\n    morning=${t.ud?.lastNotifications?.morningKstDate ?? '<n/a>'}\n    productIds: ${t.tracks.map((x) => x.productId).join(', ')}`,
  );
}

process.exit(0);
