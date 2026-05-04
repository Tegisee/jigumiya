/**
 * G v2 (2026-05-04): 카테고리 단위 round-robin 가격 체크.
 *
 * shared_products 순회 끝난 후 매 사이클 1회 호출. notify-only 모드는 호출 X.
 *
 * 호출 단위 — 카테고리 1개 = 1콜 (50개 상품 한 번에 응답):
 *   - category_best         → bestcategories API (categoryId)
 *   - category_best_baby    → search API (keyword)
 *   - event_best            → search API (keyword + minPrice 30000 클라이언트 필터)
 *
 * 각 컬렉션에서 batchSize(2)개 카테고리씩 round-robin → 사이클당 6콜.
 * 카테고리 정보는 Firestore 기존 문서에서 동적 read (별도 정의 파일 없음):
 *   - category_best/{categoryId} 문서:    categoryId, categoryName, displayOrder, products[]
 *   - category_best_baby/{slug} 문서:     keyword, category, displayOrder, products[]
 *   - event_best/{slug} 문서:             keyword, eventName, type, minPrice, products[]
 * 컬렉션이 비어있으면 해당 컬렉션 스킵 (jigumiya 프로젝트에 baby/event는 아이고 통합 후 채워짐).
 *
 * 가격 비교:
 *   - 기존 문서 products[*].productPrice 를 prev로 사용
 *   - 새 fetch 결과의 같은 productId 매칭 → 변동 감지
 *   - 하락: price_drops 멱등 upsert + (추적자 있으면) events.drops 추가 → §B 사용자별 통합
 *   - 상승: (추적자 있으면) events.ups 추가
 *   - 추적자 없으면 알림 X (price_drops 기록만 → 가격변동 탭 노출)
 *
 * 문서 갱신: 통째 set (기존 updater와 동일 페이로드 형식) → 다음 사이클 prev 정정.
 *
 * 포인터: meta/stats.categoryCyclePointers (set-merge로 다른 컬렉션 키 보존).
 *   { category_best: 4, category_best_baby: 6, event_best: 2 }
 *   끝까지 가면 0으로 자동 초기화 (round-robin).
 *
 * Rate-limited 즉시 종료 — 발생한 컬렉션의 포인터는 갱신 안 함 (다음 cron에서 같은 자리부터 재개).
 */

import {
  type Firestore,
  type DocumentData,
} from 'firebase-admin/firestore';
import {
  fetchBestCategoryProducts,
  searchKeywordCategoryProducts,
  type BestCategoryProduct,
  type SearchedCategoryProduct,
} from './coupang-api.js';
import { recordPriceDrop } from './price-drop.js';
import type { ProductBrief } from './notifier.js';
import type { RawEvents, TrackerInfo } from './index.js';

type FetchMode = 'bestCategories' | 'search';

interface CollectionConfig {
  name: 'category_best' | 'category_best_baby' | 'event_best';
  mode: FetchMode;
  minPrice: number; // 클라이언트 필터 (search 모드만 의미). 0 이면 미적용.
}

const COLLECTIONS: ReadonlyArray<CollectionConfig> = [
  { name: 'category_best', mode: 'bestCategories', minPrice: 0 },
  { name: 'category_best_baby', mode: 'search', minPrice: 0 },
  { name: 'event_best', mode: 'search', minPrice: 30000 },
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

/** collectionGroup('tracked')에서 productId로 추적자 조회 */
async function fetchTrackersByProductId(
  db: Firestore,
  productId: string,
): Promise<TrackerInfo[]> {
  const snap = await db
    .collectionGroup('tracked')
    .where('productId', '==', productId)
    .get();
  const trackers: TrackerInfo[] = [];
  for (const doc of snap.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    trackers.push({
      uid,
      targetPrice: doc.data().targetPrice as number | undefined,
    });
  }
  return trackers;
}

/** 기존 문서의 products[productId → price] 인덱싱 */
async function loadPrevPrices(
  db: Firestore,
  collectionName: string,
  docId: string,
): Promise<Map<string, { price: number; thumbnail: string }>> {
  const map = new Map<string, { price: number; thumbnail: string }>();
  try {
    const snap = await db.collection(collectionName).doc(docId).get();
    const products = (snap.data()?.products as DocumentData[] | undefined) ?? [];
    for (const p of products) {
      const pid = String(p.productId ?? '');
      const price = Number(p.productPrice ?? 0);
      if (!pid || price <= 0) continue;
      map.set(pid, {
        price,
        thumbnail: String(p.productImage ?? p.thumbnail ?? ''),
      });
    }
  } catch (e) {
    console.warn(
      `[CategoryCycle] prev 문서 read 실패 ${collectionName}/${docId}:`,
      e,
    );
  }
  return map;
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

const BROADCAST_TIER10 = -10;
const BROADCAST_TIER20 = -20;

export interface CategoryCycleStats {
  apiCalls: number;
  drops: number;
  ups: number;
  rateLimited: boolean;
}

export async function processCategoryRoundRobin(opts: {
  db: Firestore;
  events: RawEvents;
  sleepMs: number;
  batchSize?: number;
}): Promise<CategoryCycleStats> {
  const { db, events, sleepMs } = opts;
  const batchSize = opts.batchSize ?? 2;
  const stats: CategoryCycleStats = {
    apiCalls: 0,
    drops: 0,
    ups: 0,
    rateLimited: false,
  };

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
    let drops = 0;
    let ups = 0;

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
          // 카테고리 사이 sleep (다음 카테고리 진행)
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

      // 2) 가격 비교 (prev 문서 read)
      const prevMap = await loadPrevPrices(db, cfg.name, cat.docId);
      for (const newP of fresh) {
        const prev = prevMap.get(newP.productId);
        if (!prev || prev.price <= 0 || newP.productPrice <= 0) continue;
        if (prev.price === newP.productPrice) continue;

        const dropRate = ((newP.productPrice - prev.price) / prev.price) * 100;
        const brief: ProductBrief = {
          productId: newP.productId,
          productName: newP.productName,
          currentPrice: newP.productPrice,
          previousPrice: prev.price,
        };

        if (newP.productPrice < prev.price) {
          await recordPriceDrop(
            db,
            newP.productId,
            newP.productName,
            newP.productImage || prev.thumbnail,
            prev.price,
            newP.productPrice,
            0,
          );
          drops++;

          const trackers = await fetchTrackersByProductId(db, newP.productId);
          if (trackers.length > 0) {
            events.drops.push({ ...brief, dropRate, trackers });
            for (const t of trackers) {
              const target = t.targetPrice;
              if (target && target > 0 && newP.productPrice <= target) {
                events.targets.push({
                  uid: t.uid,
                  item: brief,
                  targetPrice: target,
                });
              }
            }
          }
          // H2 (2026-05-04, G v2): -10% 이상 급락 → category_broadcast 발송 후보로 누적.
          //
          // category_best (지금이야 베스트 카테고리) → jigumiya 사용자 전체 broadcast
          // category_best_baby / event_best → broadcast 발송 X
          //   이유: 아이고 앱은 가격변동 탭이 없어 broadcast 클릭 후 확인할 화면이 없음.
          //   추적자에게는 events.drops 경유로 §2-D price_drop_summary 도달 (H1 상품별 1건).
          //
          // 발송 시 추적자(이미 §2-D drop 상품별 알림 받음)는 자동 제외 (flush 단에서).
          if (dropRate <= BROADCAST_TIER10) {
            if (cfg.name === 'category_best') {
              events.categoryBroadcasts.push({
                brief,
                dropRate,
                app: 'jigumiya',
              });
            }
            // legacy 통계 — 모든 컬렉션 카운팅 유지 (모니터링용)
            if (dropRate <= BROADCAST_TIER20) events.broadcastTier20.push(brief);
            else events.broadcastTier10.push(brief);
          }
        } else {
          const trackers = await fetchTrackersByProductId(db, newP.productId);
          if (trackers.length > 0) {
            ups++;
            events.ups.push({ ...brief, dropRate, trackers });
          }
        }
      }

      // 3) 문서 갱신 — category_best은 02:00 KST `category-best-updater` cron이 단독 갱신.
      // G round-robin은 가격 비교 + 알림 발송만 수행, 문서 덮어쓰기 X.
      // 이유: bestcategories API와 search API의 productPrice 출처 mismatch 방어 (5/5 사고 원인).
      // baby/event는 별도 updater가 없으므로 G가 갱신 책임 유지 (다음 사이클 prev 정정).
      if (cfg.name !== 'category_best') {
        try {
          await db
            .collection(cfg.name)
            .doc(cat.docId)
            .set(buildPayload(cfg, cat, fresh), { merge: true });
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
    stats.drops += drops;
    stats.ups += ups;

    if (!stats.rateLimited) {
      const newPointer = end >= defs.length ? 0 : end;
      await writePointer(db, cfg.name, newPointer);
      console.log(
        `[CategoryCycle] ${cfg.name} ${start}~${end - 1} 처리 완료 api=${api} drops=${drops}` +
          (ups > 0 ? ` ups=${ups}` : ''),
      );
    }
  }

  console.log(
    `[CategoryCycle] 합계 api=${stats.apiCalls} drops=${stats.drops}${stats.ups > 0 ? ` ups=${stats.ups}` : ''}${stats.rateLimited ? ' (rate-limited 종료)' : ' pointer 갱신 완료'}`,
  );

  return stats;
}
