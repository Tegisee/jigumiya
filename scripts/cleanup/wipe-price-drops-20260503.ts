/**
 * 1회성 정리 스크립트 — `price_drops` 컬렉션 전체 wipe.
 *
 * 배경:
 *   `recordPriceDrop`이 `add()` autoId로 기록하던 시기에 같은 productId가 cron마다
 *   별도 문서로 누적되어 홈 "오늘의 특가" / 가격변동 탭에 동일 상품이 N번 표시됨.
 *   가격 추적 알림 발송(`loadDropsForNotifyOnly`)은 productId별 dedup 했으므로 영향 없음.
 *
 * 정책 (사용자 합의 A2):
 *   기존 autoId 문서를 productId 키로 마이그레이션하지 않고 전체 삭제.
 *   다음 shared-price-check.yml cron(10분 간격)이 새 키 체계(`doc(productId).set`)로 채움.
 *   wipe ~ 다음 cron 사이 짧은 시간 동안 "오늘의 특가" 카드는 비어 보임 (category_best fallback이
 *   대체 데이터 표시).
 *
 * 환경 변수:
 *   FIREBASE_SERVICE_ACCOUNT_KEY  — 서비스 계정 JSON 문자열 (필수)
 *   DRY_RUN                       — "false" 면 실제 삭제, 그 외 dry-run (기본 true)
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

const DRY_RUN = (process.env.DRY_RUN ?? 'true') !== 'false';
const BATCH_SIZE = 400; // Firestore batch 한도 500 — 안전 마진

async function main() {
  console.log(`[wipe-price-drops] DRY_RUN=${DRY_RUN}`);

  const snap = await db.collection('price_drops').get();
  console.log(`[wipe-price-drops] 총 문서 ${snap.size}개`);

  if (snap.size === 0) {
    console.log('[wipe-price-drops] 삭제할 문서 없음');
    process.exit(0);
  }

  // productId별 그룹 통계 (dry-run 시 중복 정도 가시화)
  const byProductId = new Map<string, number>();
  for (const d of snap.docs) {
    const pid = (d.data().productId as string | undefined) ?? '<no-productId>';
    byProductId.set(pid, (byProductId.get(pid) ?? 0) + 1);
  }
  const dupGroups = [...byProductId.entries()].filter(([, n]) => n > 1);
  console.log(
    `[wipe-price-drops] 고유 productId ${byProductId.size}개 / 중복 그룹 ${dupGroups.length}개`,
  );
  if (dupGroups.length > 0) {
    const top = dupGroups.sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('[wipe-price-drops] 중복 상위 5:');
    for (const [pid, n] of top) console.log(`  ${pid} → ${n}건`);
  }

  if (DRY_RUN) {
    console.log('[wipe-price-drops] DRY_RUN — 삭제 스킵, 종료');
    process.exit(0);
  }

  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const d of chunk) batch.delete(d.ref);
    await batch.commit();
    deleted += chunk.length;
    console.log(`[wipe-price-drops] batch 삭제 ${deleted}/${snap.size}`);
  }

  console.log(`[wipe-price-drops] 완료 deleted=${deleted}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
