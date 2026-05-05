/**
 * 카테고리 베스트 round-robin — fetch + (baby/event) 문서 갱신만 수행.
 *
 * 2026-05-05 사고 후속 정리:
 *   - 카테고리 베스트(category_best / category_best_baby / event_best) 가격 변동 감지 + 알림 발송 전체 제거.
 *   - bestcategories ↔ search API의 productPrice 출처 mismatch가 가짜 변동을 만들어 폭탄 알림 사고 발생.
 *   - 가격 추적/알림은 shared_products 단일 출처로 일원화. 카테고리 베스트는 데이터 갱신만 담당.
 *
 * 처리 단위:
 *   - 카테고리 1개 = 1콜 (50개 상품 한 번에 응답)
 *   - 매 사이클 batchSize(기본 2)개 카테고리씩 round-robin
 *   - 사이클당 6콜 (3 컬렉션 × 2 카테고리)
 *
 * 컬렉션별 fetch + 갱신 정책:
 *   - category_best         → bestcategories API. 문서 갱신 X (02:00 KST `category-best-updater` cron 단독 갱신).
 *                              이번 사이클에서는 사실상 fetch 의미가 없으나 향후 활용 여지 위해 호출 자체는 유지하지 않음.
 *   - category_best_baby    → search API. set merge로 문서 갱신 (별도 updater 없음).
 *   - event_best            → search API + minPrice 30000 클라이언트 필터. set merge 갱신.
 *
 * 카테고리 정의는 Firestore 문서에서 동적 read (별도 정의 파일 없음):
 *   - category_best/{categoryId} 문서:    categoryId, categoryName, displayOrder, products[]
 *   - category_best_baby/{slug} 문서:     keyword, category, displayOrder, products[]
 *   - event_best/{slug} 문서:             keyword, eventName, type, minPrice, products[]
 * 컬렉션 비어있으면 즉시 스킵.
 *
 * 포인터: meta/stats.categoryCyclePointers (set-merge로 다른 컬렉션 키 보존).
 *   { category_best: 4, category_best_baby: 6, event_best: 2 }
 *   끝까지 가면 0으로 자동 초기화 (round-robin).
 *
 * Rate-limited 즉시 종료 — 발생한 컬렉션의 포인터는 갱신 안 함 (다음 cron에서 같은 자리부터 재개).
 */

import { type Firestore } from 'firebase-admin/firestore';
import {
  fetchBestCategoryProducts,
  searchKeywordCategoryProducts,
  type BestCategoryProduct,
  type SearchedCategoryProduct,
} from './coupang-api.js';

type FetchMode = 'bestCategories' | 'search';

interface CollectionConfig {
  name: 'category_best' | 'category_best_baby' | 'event_best';
  mode: FetchMode;
  minPrice: number; // 클라이언트 필터 (search 모드만 의미). 0 이면 미적용.
  /** false면 fetch 후 문서 set merge 스킵 (category_best은 02:00 cron이 단독 갱신) */
  updateDoc: boolean;
}

const COLLECTIONS: ReadonlyArray<CollectionConfig> = [
  { name: 'category_best', mode: 'bestCategories', minPrice: 0, updateDoc: false },
  { name: 'category_best_baby', mode: 'search', minPrice: 0, updateDoc: true },
  { name: 'event_best', mode: 'search', minPrice: 30000, updateDoc: true },
];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 카테고리 정의 — Firestore 문서에서 동적 추출 (별도 categories.ts 의존성 없음) */
interface CategoryDef {
  docId: string;
  categoryId?: number; // bestCategories 모드 전용
  keyword?: string;    // search 모드 전용
  // 갱신 페이로드 보존용 메타 필드 (모드별 사용)
  categoryName?: string;
  displayOrder?: number;
  category?: string;
  eventName?: string;
  type?: string;
}

async function loadCategoryDefs(
  db: Firestore,
  cfg: CollectionConfig,
): Promise<CategoryDef[]> {
  const snap = await db.collection(cfg.name).get();
  const docs = [...snap.docs].sort((a, b) => a.id.localeCompare(b.id));
  const defs: CategoryDef[] = [];
  for (const d of docs) {
    const data = d.data();
    if (cfg.mode === 'bestCategories') {
      const cidStr = String(data.categoryId ?? d.id);
      const cid = Number(cidStr);
      if (!Number.isFinite(cid) || cid <= 0) continue;
      defs.push({
        docId: d.id,
        categoryId: cid,
        categoryName: data.categoryName as string | undefined,
        displayOrder: data.displayOrder as number | undefined,
      });
    } else {
      const keyword = data.keyword as string | undefined;
      if (!keyword) continue;
      defs.push({
        docId: d.id,
        keyword,
        category: data.category as string | undefined,
        displayOrder: data.displayOrder as number | undefined,
        eventName: data.eventName as string | undefined,
        type: data.type as string | undefined,
      });
    }
  }
  return defs;
}

async function readPointer(
  db: Firestore,
  collectionName: string,
): Promise<number> {
  try {
    const snap = await db.collection('meta').doc('stats').get();
    const pointers =
      (snap.data()?.categoryCyclePointers as
        | Record<string, number>
        | undefined) ?? {};
    return Number(pointers[collectionName] ?? 0);
  } catch (e) {
    console.warn(`[CategoryCycle] pointer 읽기 실패 ${collectionName}:`, e);
    return 0;
  }
}

async function writePointer(
  db: Firestore,
  collectionName: string,
  pointer: number,
): Promise<void> {
  try {
    await db
      .collection('meta')
      .doc('stats')
      .set(
        { categoryCyclePointers: { [collectionName]: pointer } },
        { merge: true },
      );
  } catch (e) {
    console.warn(`[CategoryCycle] pointer 갱신 실패 ${collectionName}:`, e);
  }
}

/** 컬렉션별 페이로드 — 기존 updater와 동일 형식 유지 */
function buildPayload(
  cfg: CollectionConfig,
  cat: CategoryDef,
  products: BestCategoryProduct[] | SearchedCategoryProduct[],
): Record<string, unknown> {
  const now = Date.now();
  if (cfg.mode === 'bestCategories') {
    return {
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      displayOrder: cat.displayOrder,
      updatedAt: now,
      products,
    };
  }
  if (cfg.name === 'event_best') {
    return {
      slug: cat.docId,
      eventName: cat.eventName,
      type: cat.type,
      keyword: cat.keyword,
      minPrice: cfg.minPrice,
      updatedAt: now,
      products,
    };
  }
  // category_best_baby
  return {
    category: cat.category,
    slug: cat.docId,
    keyword: cat.keyword,
    displayOrder: cat.displayOrder,
    updatedAt: now,
    products,
  };
}

export interface CategoryCycleStats {
  apiCalls: number;
  rateLimited: boolean;
}

export async function processCategoryRoundRobin(opts: {
  db: Firestore;
  sleepMs: number;
  batchSize?: number;
}): Promise<CategoryCycleStats> {
  const { db, sleepMs } = opts;
  const batchSize = opts.batchSize ?? 2;
  const stats: CategoryCycleStats = { apiCalls: 0, rateLimited: false };

  for (const cfg of COLLECTIONS) {
    if (stats.rateLimited) break;

    const defs = await loadCategoryDefs(db, cfg);
    if (defs.length === 0) {
      console.log(`[CategoryCycle] ${cfg.name} 비어있음 — 스킵`);
      continue;
    }
    const pointer = await readPointer(db, cfg.name);
    const start = pointer % defs.length;
    const end = Math.min(start + batchSize, defs.length);
    const batch = defs.slice(start, end);

    let api = 0;
    let updated = 0;

    for (let bi = 0; bi < batch.length; bi++) {
      const cat = batch[bi];
      // 1) fetch
      let fresh: BestCategoryProduct[] | SearchedCategoryProduct[] = [];
      if (cfg.mode === 'bestCategories') {
        const r = await fetchBestCategoryProducts(cat.categoryId!, 50);
        api++;
        if (!r.ok) {
          if (r.rateLimited) {
            console.warn(
              `[CategoryCycle] ${cfg.name}/${cat.docId} rate-limited — 즉시 종료`,
            );
            stats.rateLimited = true;
            break;
          }
          if (bi < batch.length - 1) await sleep(sleepMs);
          continue;
        }
        fresh = r.products;
      } else {
        const r = await searchKeywordCategoryProducts(
          cat.keyword!,
          50,
          cfg.minPrice,
        );
        api++;
        if (!r.ok) {
          if (r.rateLimited) {
            console.warn(
              `[CategoryCycle] ${cfg.name}/${cat.docId} rate-limited — 즉시 종료`,
            );
            stats.rateLimited = true;
            break;
          }
          if (bi < batch.length - 1) await sleep(sleepMs);
          continue;
        }
        fresh = r.products;
      }

      if (fresh.length === 0) {
        if (bi < batch.length - 1) await sleep(sleepMs);
        continue;
      }

      // 2) 문서 갱신 — category_best은 02:00 KST `category-best-updater` cron이 단독 갱신.
      //    가격 추적/알림은 shared_products 단일 출처로 일원화 (5/5 사고 후속, A 정책).
      if (cfg.updateDoc) {
        try {
          await db
            .collection(cfg.name)
            .doc(cat.docId)
            .set(buildPayload(cfg, cat, fresh), { merge: true });
          updated++;
        } catch (e) {
          console.warn(
            `[CategoryCycle] 문서 갱신 실패 ${cfg.name}/${cat.docId}:`,
            e,
          );
        }
      }

      // 카테고리 사이 sleep (마지막 카테고리 뒤에는 생략)
      if (bi < batch.length - 1) await sleep(sleepMs);
    }

    stats.apiCalls += api;

    if (!stats.rateLimited) {
      const newPointer = end >= defs.length ? 0 : end;
      await writePointer(db, cfg.name, newPointer);
      console.log(
        `[CategoryCycle] ${cfg.name} ${start}~${end - 1} 처리 완료 api=${api} updated=${updated}`,
      );
    }
  }

  console.log(
    `[CategoryCycle] 합계 api=${stats.apiCalls}${stats.rateLimited ? ' (rate-limited 종료)' : ' pointer 갱신 완료'}`,
  );

  return stats;
}
