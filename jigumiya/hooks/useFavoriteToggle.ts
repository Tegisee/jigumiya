import { useState, useEffect, useCallback } from 'react';
import type { TrackedItem } from '../types';
import {
  getCurrentUid,
  hasFavoriteRef,
  addFavoriteRef,
  removeFavoriteRef,
  incrementFavoriteCount,
  upsertSharedProduct,
  trackedItemToSharedProduct,
} from '../services/firebase';

/**
 * 자주사는상품 토글 훅.
 * mount 시 favorites 존재 여부 조회 → toggle 시 shared_products 보장 + ref 추가/삭제 + 카운터 증감.
 * productId 없는 과거 데이터는 enabled=false (버튼 숨김용).
 */
export function useFavoriteToggle(item: TrackedItem | null | undefined) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const productId = item?.productId;

  useEffect(() => {
    if (!productId) {
      setIsFavorite(false);
      return;
    }
    const uid = getCurrentUid();
    if (!uid) return;
    let cancelled = false;
    hasFavoriteRef(uid, productId).then((exists) => {
      if (!cancelled) setIsFavorite(exists);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const toggle = useCallback(async () => {
    if (!item?.productId || busy) return;
    const uid = getCurrentUid();
    if (!uid) return;
    setBusy(true);
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      if (next) {
        const shared = trackedItemToSharedProduct(item);
        if (shared) await upsertSharedProduct(shared);
        await addFavoriteRef(uid, item.productId);
        await incrementFavoriteCount(item.productId, 1);
      } else {
        await removeFavoriteRef(uid, item.productId);
        await incrementFavoriteCount(item.productId, -1);
      }
    } catch (e) {
      console.warn('[favorites] toggle 실패:', e);
      setIsFavorite(!next);
    } finally {
      setBusy(false);
    }
  }, [item, isFavorite, busy]);

  return {
    isFavorite,
    busy,
    enabled: !!productId,
    toggle,
  };
}
