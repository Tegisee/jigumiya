/**
 * shared_products.createdAt 백필 — 1.0.16 fetchAllSharedProducts 쿼리 호환용.
 *
 * 배경: admin.tsx의 fetchAllSharedProducts가 orderBy('createdAt')을 사용해
 *      createdAt 필드 없는 77개 doc이 결과에서 제외되는 버그(2026-05-11 발견).
 *      코드 측은 orderBy(documentId())로 fix 완료, 본 스크립트는 데이터 보강용.
 *
 * 동작:
 *   - shared_products 전체 fetch → createdAt 미존재 doc 필터
 *   - 각 doc에 createdAt = Date.now() (ms epoch) 일괄 set (merge)
 *   - batch 500개 단위 commit (77개라 1 batch로 충분)
 *
 * 실행:
 *   DRY-RUN (기본):
 *     FIREBASE_SERVICE_ACCOUNT_KEY=$(cat ~/jigumiya/builds/jigumiya-firebase-adminsdk-fbsvc-14daa5f617.json) \
 *       node scripts/cleanup/backfill-shared-createdat-20260511.mjs
 *
 *   실제 쓰기:
 *     APPLY=1 FIREBASE_SERVICE_ACCOUNT_KEY=$(cat ...) node scripts/cleanup/backfill-shared-createdat-20260511.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyEnv) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY env required');
  process.exit(1);
}
const APPLY = process.env.APPLY === '1';

initializeApp({ credential: cert(JSON.parse(keyEnv)) });
const db = getFirestore();

console.log(`[backfill] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log('[backfill] shared_products 전체 fetch…');

const snap = await db.collection('shared_products').get();
console.log(`[backfill] 전체: ${snap.size}개`);

const targets = snap.docs.filter((d) => d.data().createdAt === undefined);
console.log(`[backfill] createdAt 누락 대상: ${targets.length}개`);

if (targets.length === 0) {
  console.log('[backfill] 대상 없음 — 종료');
  process.exit(0);
}

const now = Date.now();
console.log(`[backfill] createdAt 값 = ${now} (${new Date(now).toISOString()})`);
console.log('[backfill] 대상 목록 (앞 10개):');
targets.slice(0, 10).forEach((d) => {
  const x = d.data();
  console.log(`  ${d.id} | ${(x.productName ?? '(no name)').slice(0, 50)}`);
});

if (!APPLY) {
  console.log('[backfill] DRY-RUN 종료. APPLY=1 로 다시 실행하면 실제 write.');
  process.exit(0);
}

console.log('[backfill] batch commit 시작…');
const batch = db.batch();
for (const d of targets) {
  batch.set(d.ref, { createdAt: now }, { merge: true });
}
await batch.commit();
console.log(`[backfill] 완료: ${targets.length}개 createdAt 보강.`);

const verify = await db
  .collection('shared_products')
  .orderBy('createdAt', 'asc')
  .get();
console.log(`[backfill] 검증 — orderBy('createdAt') 결과: ${verify.size}개 (전체 ${snap.size}개)`);
process.exit(0);
