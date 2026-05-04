// 1회성 분석 — users 컬렉션의 app 필드 분포 + 식별 가능한 다른 필드 점검
// 사용: cd scripts/shared-price-checker && node analyze-users.mjs <service-account-json-path>

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saPath = process.argv[2];
if (!saPath) {
  console.error('Usage: node analyze-users.mjs <service-account-json-path>');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('users').get();
let total = 0;
let withToken = 0;
let notifEnabled = 0;
let notifDisabled = 0;
const appCounts = { jigumiya: 0, aigo: 0, missing: 0, other: 0 };
const allFields = new Map(); // field → count
const missingAppSamples = [];
const tokenSamples = []; // ExponentPushToken 외 형태 탐지

for (const u of snap.docs) {
  total++;
  const d = u.data();
  for (const k of Object.keys(d)) {
    allFields.set(k, (allFields.get(k) ?? 0) + 1);
  }
  const token = d.expoPushToken;
  if (token) withToken++;
  if (d.notificationEnabled === false) notifDisabled++;
  else notifEnabled++;
  const app = d.app;
  if (app == null) appCounts.missing++;
  else if (app === 'jigumiya') appCounts.jigumiya++;
  else if (app === 'aigo') appCounts.aigo++;
  else appCounts.other++;
  if (app == null && missingAppSamples.length < 8) {
    missingAppSamples.push({
      uid: u.id,
      hasToken: !!token,
      tokenPrefix: token ? String(token).slice(0, 30) : null,
      fields: Object.keys(d).sort(),
      lastActiveAt: d.lastActiveAt,
    });
  }
  if (token && tokenSamples.length < 10) {
    const t = String(token);
    if (!t.startsWith('ExponentPushToken[')) {
      tokenSamples.push({ uid: u.id, prefix: t.slice(0, 40) });
    }
  }
}

// 서브컬렉션 보유 여부 (jigumiya 식별 단서: items/tracked/favorites)
let usersWithItems = 0;
let usersWithTracked = 0;
let usersWithFavorites = 0;
const subCollByUid = []; // app=missing인 사용자별 보유 여부

for (const u of snap.docs) {
  const [items, tracked, favorites] = await Promise.all([
    db.collection('users').doc(u.id).collection('items').limit(1).get(),
    db.collection('users').doc(u.id).collection('tracked').limit(1).get(),
    db.collection('users').doc(u.id).collection('favorites').limit(1).get(),
  ]);
  const hasItems = !items.empty;
  const hasTracked = !tracked.empty;
  const hasFavorites = !favorites.empty;
  if (hasItems) usersWithItems++;
  if (hasTracked) usersWithTracked++;
  if (hasFavorites) usersWithFavorites++;
  if (u.data().app == null && subCollByUid.length < 12) {
    subCollByUid.push({
      uid: u.id,
      items: hasItems,
      tracked: hasTracked,
      favorites: hasFavorites,
    });
  }
}

// 결과 출력
console.log('=== users 컬렉션 분석 ===');
console.log(`총 사용자: ${total}`);
console.log(`expoPushToken 보유: ${withToken} (${((withToken / total) * 100).toFixed(1)}%)`);
console.log(`notificationEnabled !== false: ${notifEnabled}, === false: ${notifDisabled}`);
console.log(`\napp 필드 분포:`);
console.log(`  jigumiya: ${appCounts.jigumiya}`);
console.log(`  aigo:     ${appCounts.aigo}`);
console.log(`  missing:  ${appCounts.missing} (legacy 기존 사용자)`);
console.log(`  other:    ${appCounts.other}`);

console.log(`\n전체 필드 분포 (필드명 → 보유 사용자 수):`);
const sortedFields = [...allFields].sort((a, b) => b[1] - a[1]);
for (const [f, c] of sortedFields) {
  console.log(`  ${f.padEnd(30)} ${c}`);
}

console.log(`\n서브컬렉션 보유 사용자:`);
console.log(`  items     보유: ${usersWithItems}`);
console.log(`  tracked   보유: ${usersWithTracked}`);
console.log(`  favorites 보유: ${usersWithFavorites}`);

console.log(`\napp=missing 사용자 샘플 (최대 8개):`);
for (const s of missingAppSamples) {
  console.log(`  uid=${s.uid.slice(0, 16)}.. hasToken=${s.hasToken} tokenPrefix=${s.tokenPrefix} lastActive=${s.lastActiveAt}`);
  console.log(`    fields: ${s.fields.join(', ')}`);
}

console.log(`\napp=missing 사용자 서브컬렉션 보유 (최대 12개):`);
for (const s of subCollByUid) {
  const flags = [
    s.items ? 'items' : '',
    s.tracked ? 'tracked' : '',
    s.favorites ? 'favorites' : '',
  ]
    .filter(Boolean)
    .join('/');
  console.log(`  uid=${s.uid.slice(0, 20)}.. → ${flags || '(서브컬렉션 없음)'}`);
}

if (tokenSamples.length > 0) {
  console.log(`\n비-ExponentPushToken 형식 토큰 샘플:`);
  for (const t of tokenSamples) console.log(`  uid=${t.uid.slice(0, 16)}.. prefix=${t.prefix}`);
}

process.exit(0);
