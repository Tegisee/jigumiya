/**
 * tracked-backfill — 1회 실행 보강 스크립트 (workflow_dispatch 전용)
 *
 * 배경 (CLAUDE.md 2026-05-01 ⑦ 첫 cron 자동 실행 분석):
 *   - 가격 하락 2건 감지했으나 push 발송 0건
 *   - 원인 2: `tracked.productId` 필드 누락 → collectionGroup 쿼리 매칭 0건
 *   - 원인 3: `shared_products.trackerCount` 음수 누적 (increment 비대칭 의심)
 *
 * 1.0.8 클라이언트 backfillProductIds는 자가 치유 추가됐지만
 * 미업그레이드 사용자(1.0.7 이하) + 단축 URL resolve 실패 누락분은 서버 backfill 필요.
 *
 * 처리 단계:
 *   Phase A — users/{uid}/items 스캔
 *     productId 누락 문서를 url/resolvedUrl에서 다중 패턴 재추출
 *     성공 시 ① items doc에 productId 필드 추가
 *            ② users/{uid}/tracked/{productId} doc 생성 (idempotent setDoc)
 *
 *   Phase B — collectionGroup('tracked') 스캔
 *     productId 필드 누락 문서를 doc ID로 보강 (addTrackedRef는 doc ID = productId 규약)
 *
 *   Phase C — shared_products.trackerCount 재계산
 *     touched productId마다 collectionGroup 실측 카운트로 trackerCount 정정
 *     음수 / 실측과 불일치 케이스 모두 보정
 *
 * 안전장치:
 *   - DRY_RUN=true (기본): 스캔/계획만 출력, 쓰기 0
 *   - DRY_RUN=false: 실제 적용 (Admin SDK라 보안 규칙 우회)
 *   - 배치 단위(500) write 분할
 *   - 각 Phase 카운터 출력 → notif=0 사고 직접 검증
 */

import { initializeApp, cert } from 'firebase-admin/app';
import {
  getFirestore,
  type Firestore,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { extractProductId } from './utils.js';

// ─── 설정 ───
const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const BATCH_LIMIT = 500; // Firestore batch 한도

// ─── Firebase Admin 초기화 ───
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}',
);
initializeApp({ credential: cert(serviceAccount) });
const db: Firestore = getFirestore();

// ─── 배치 헬퍼 ───
class BatchWriter {
  private batch: WriteBatch;
  private count = 0;
  private flushed = 0;

  constructor(private firestore: Firestore) {
    this.batch = firestore.batch();
  }

  async set(
    ref: FirebaseFirestore.DocumentReference,
    data: FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>,
    options?: FirebaseFirestore.SetOptions,
  ): Promise<void> {
    if (options) {
      this.batch.set(ref, data, options);
    } else {
      this.batch.set(ref, data);
    }
    this.count += 1;
    if (this.count >= BATCH_LIMIT) await this.flush();
  }

  async update(
    ref: FirebaseFirestore.DocumentReference,
    data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void> {
    this.batch.update(ref, data);
    this.count += 1;
    if (this.count >= BATCH_LIMIT) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.count === 0) return;
    if (!DRY_RUN) await this.batch.commit();
    this.flushed += this.count;
    this.count = 0;
    this.batch = this.firestore.batch();
  }

  get totalWrites(): number {
    return this.flushed + this.count;
  }
}

// ─── Phase A: legacy items 보강 ───
async function phaseA(touched: Set<string>): Promise<{
  scanned: number;
  missingProductId: number;
  extracted: number;
  itemsUpdated: number;
  trackedCreated: number;
  unrecoverable: number;
}> {
  console.log('[Phase A] users/{uid}/items 스캔 시작');
  const writer = new BatchWriter(db);
  const stats = {
    scanned: 0,
    missingProductId: 0,
    extracted: 0,
    itemsUpdated: 0,
    trackedCreated: 0,
    unrecoverable: 0,
  };

  const snap = await db.collectionGroup('items').get();
  for (const doc of snap.docs) {
    stats.scanned += 1;
    const data = doc.data() as Record<string, unknown>;

    if (typeof data.productId === 'string' && data.productId.length > 0) continue;
    stats.missingProductId += 1;

    const url = typeof data.url === 'string' ? data.url : undefined;
    const resolvedUrl =
      typeof data.resolvedUrl === 'string' ? data.resolvedUrl : undefined;
    const affiliateUrl =
      typeof data.affiliateUrl === 'string' ? data.affiliateUrl : undefined;

    const candidates = [resolvedUrl, url, affiliateUrl];
    let productId: string | null = null;
    for (const c of candidates) {
      productId = extractProductId(c);
      if (productId) break;
    }

    if (!productId) {
      stats.unrecoverable += 1;
      continue;
    }

    stats.extracted += 1;

    // ① items doc 보강
    await writer.update(doc.ref, { productId });
    stats.itemsUpdated += 1;

    // ② tracked doc 생성 — uid 추출 (path: users/{uid}/items/{itemId})
    const segments = doc.ref.path.split('/');
    const uid = segments[1];
    if (!uid) continue;

    const trackedRef = db.doc(`users/${uid}/tracked/${productId}`);
    const trackedSnap = await trackedRef.get();
    if (!trackedSnap.exists) {
      const targetPrice =
        typeof data.targetPrice === 'number' ? data.targetPrice : undefined;
      const addedAt =
        typeof data.createdAt === 'number' ? data.createdAt : Date.now();
      await writer.set(trackedRef, {
        productId,
        ...(targetPrice !== undefined ? { targetPrice } : {}),
        addedAt,
      });
      stats.trackedCreated += 1;
    }

    touched.add(productId);
  }

  await writer.flush();
  console.log(
    `[Phase A] scanned=${stats.scanned} missing=${stats.missingProductId} ` +
      `extracted=${stats.extracted} itemsUpdated=${stats.itemsUpdated} ` +
      `trackedCreated=${stats.trackedCreated} unrecoverable=${stats.unrecoverable} ` +
      `writes=${writer.totalWrites}`,
  );
  return stats;
}

// ─── Phase B: tracked 필드 보강 ───
async function phaseB(touched: Set<string>): Promise<{
  scanned: number;
  missingProductId: number;
  backfilled: number;
}> {
  console.log('[Phase B] collectionGroup(tracked) 스캔 시작');
  const writer = new BatchWriter(db);
  const stats = { scanned: 0, missingProductId: 0, backfilled: 0 };

  const snap = await db.collectionGroup('tracked').get();
  for (const doc of snap.docs) {
    stats.scanned += 1;
    const data = doc.data() as Record<string, unknown>;
    const docIdProductId = doc.ref.id; // addTrackedRef 규약: doc ID = productId

    if (typeof data.productId === 'string' && data.productId.length > 0) {
      touched.add(data.productId);
      continue;
    }
    stats.missingProductId += 1;

    if (!/^\d+$/.test(docIdProductId)) {
      // doc ID가 숫자형 productId 형태가 아니면 신뢰 불가 → 스킵
      continue;
    }

    await writer.update(doc.ref, { productId: docIdProductId });
    stats.backfilled += 1;
    touched.add(docIdProductId);
  }

  await writer.flush();
  console.log(
    `[Phase B] scanned=${stats.scanned} missing=${stats.missingProductId} ` +
      `backfilled=${stats.backfilled} writes=${writer.totalWrites}`,
  );
  return stats;
}

// ─── Phase C: trackerCount 재계산 ───
async function phaseC(touched: Set<string>): Promise<{
  productIds: number;
  mismatched: number;
  negative: number;
  corrected: number;
  missingShared: number;
}> {
  console.log(
    `[Phase C] shared_products.trackerCount 재계산 시작 (productIds=${touched.size})`,
  );
  const writer = new BatchWriter(db);
  const stats = {
    productIds: touched.size,
    mismatched: 0,
    negative: 0,
    corrected: 0,
    missingShared: 0,
  };

  for (const productId of touched) {
    // 실측 카운트
    const trackedSnap = await db
      .collectionGroup('tracked')
      .where('productId', '==', productId)
      .get();
    const actualCount = trackedSnap.size;

    const sharedRef = db.doc(`shared_products/${productId}`);
    const sharedSnap = await sharedRef.get();
    if (!sharedSnap.exists) {
      stats.missingShared += 1;
      continue;
    }

    const sharedData = sharedSnap.data() as Record<string, unknown>;
    const storedCount =
      typeof sharedData.trackerCount === 'number' ? sharedData.trackerCount : 0;

    if (storedCount < 0) stats.negative += 1;

    if (storedCount === actualCount) continue;
    stats.mismatched += 1;

    console.log(
      `  [fix] ${productId} stored=${storedCount} actual=${actualCount}`,
    );
    await writer.update(sharedRef, { trackerCount: actualCount });
    stats.corrected += 1;
  }

  await writer.flush();
  console.log(
    `[Phase C] productIds=${stats.productIds} mismatched=${stats.mismatched} ` +
      `negative=${stats.negative} corrected=${stats.corrected} ` +
      `missingShared=${stats.missingShared} writes=${writer.totalWrites}`,
  );
  return stats;
}

// ─── main ───
async function main() {
  const startedAt = Date.now();
  console.log(`[Backfill] start dryRun=${DRY_RUN}`);

  const touched = new Set<string>();

  const a = await phaseA(touched);
  const b = await phaseB(touched);
  const c = await phaseC(touched);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[Backfill] done dryRun=${DRY_RUN} elapsed=${elapsed}s\n` +
      `  itemsScanned=${a.scanned} itemsExtracted=${a.extracted} trackedCreated=${a.trackedCreated} unrecoverable=${a.unrecoverable}\n` +
      `  trackedScanned=${b.scanned} trackedBackfilled=${b.backfilled}\n` +
      `  productIdsTouched=${c.productIds} corrected=${c.corrected} negativeFound=${c.negative} missingShared=${c.missingShared}`,
  );

  if (DRY_RUN) {
    console.log(
      '[Backfill] DRY_RUN=true — 실제 쓰기 0건. 적용하려면 DRY_RUN=false 로 재실행.',
    );
  }
}

main().catch((e) => {
  console.error('[Backfill] fatal:', e);
  process.exit(1);
});
