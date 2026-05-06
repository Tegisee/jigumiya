/**
 * 1회성 — `QBsAA6mAJshIHjWi55qPhMRrtAo2` (갤럭시 S21+ 추정) user doc 수동 생성.
 * Auth는 살아있으나 users/{uid} doc이 없어 push 발송 대상에서 제외된 케이스.
 *
 * 실행:
 *   FIREBASE_SERVICE_ACCOUNT_KEY=$(cat .../jigumiya-firebase-adminsdk-fbsvc-14daa5f617.json) \
 *     node scripts/cleanup/create-user-doc-20260506.mjs
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

const TARGET_UID = 'QBsAA6mAJshIHjWi55qPhMRrtAo2';

const before = await db.collection('users').doc(TARGET_UID).get();
if (before.exists) {
  console.log('[skip] user doc already exists:', before.data());
  process.exit(0);
}

await db.collection('users').doc(TARGET_UID).set({
  app: 'jigumiya',
  notificationEnabled: true, // 정식 필드명 (사용자 요청은 'notificationsEnabled'였으나 코드 컨벤션은 's' 없음)
  expoPushToken: null,
  createdAt: FieldValue.serverTimestamp(),
});

const after = await db.collection('users').doc(TARGET_UID).get();
console.log('[created] users/' + TARGET_UID + ':', after.data());

process.exit(0);
