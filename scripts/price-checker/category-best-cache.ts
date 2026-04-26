/**
 * category_best 캐시 로더 (docs/019 §4-2)
 *
 * 04:00 KST 가격 체크 cron 시작 시 1회 로드:
 *   - category_best 전체 컬렉션 read (카테고리 20개 ≈ 20 read)
 *   - products 배열을 productId → CachedBest 맵으로 평탄화
 *
 * 호출 측은 productId 매칭 시 fetchCurrentPrice 스킵 가능.
 *
 * 신선도 정책:
 *   - 02:00 KST category-best-updater 직후 04:00 KST 가격 체크 = 약 2시간
 *   - MAX_AGE_MS 초과한 카테고리는 캐시에서 제외 (전일 데이터 오용 방지)
 *   - category-best-updater 실패한 날에는 자동 fallback to API
 */

import type { Firestore } from 'firebase-admin/firestore';

const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

export interface CachedBest {
  price: number;
  image: string;
  name: string;
  categoryId: number;
  categoryName: string;
  updatedAt: number;
}

export type CategoryBestCache = Map<string, CachedBest>;

export async function loadCategoryBestCache(
  db: Firestore,
): Promise<CategoryBestCache> {
  const cache: CategoryBestCache = new Map();

  let snap;
  try {
    snap = await db.collection('category_best').get();
  } catch (e) {
    console.warn('[CategoryBestCache] 로드 실패 — API 폴백:', e);
    return cache;
  }

  const now = Date.now();
  let staleCategories = 0;
  let totalProducts = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as {
      categoryId?: number;
      categoryName?: string;
      updatedAt?: number;
      products?: Array<{
        productId?: string;
        productName?: string;
        productPrice?: number;
        productImage?: string;
      }>;
    };

    const updatedAt = Number(data.updatedAt || 0);
    if (!updatedAt || now - updatedAt > MAX_AGE_MS) {
      staleCategories += 1;
      continue;
    }

    const categoryId = Number(data.categoryId || docSnap.id);
    const categoryName = String(data.categoryName || '');
    const products = Array.isArray(data.products) ? data.products : [];

    for (const p of products) {
      const pid = String(p.productId || '');
      const price = Number(p.productPrice || 0);
      if (!pid || price <= 0) continue;

      // 동일 productId가 여러 카테고리에 등장 가능 → 더 신선한 쪽 우선
      const existing = cache.get(pid);
      if (existing && existing.updatedAt >= updatedAt) continue;

      cache.set(pid, {
        price,
        image: String(p.productImage || ''),
        name: String(p.productName || ''),
        categoryId,
        categoryName,
        updatedAt,
      });
      totalProducts += 1;
    }
  }

  console.log(
    `[CategoryBestCache] 로드 완료 — 카테고리 ${snap.size}개 (stale ${staleCategories}) / 캐시 productId ${cache.size}개`,
  );
  return cache;
}

/**
 * 가격 변동 안전장치 (fetchCurrentPrice 30% 가드와 동일).
 * 캐시 데이터가 깨졌을 가능성 대비.
 */
export function isCacheStablePrice(
  cachedPrice: number,
  currentPrice: number,
): boolean {
  if (currentPrice <= 0) return true;
  const changeRate = Math.abs(cachedPrice - currentPrice) / currentPrice;
  return changeRate <= 0.3;
}
