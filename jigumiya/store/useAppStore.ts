import { Alert } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackedItem } from '../types';
import { MAX_TRACKED_ITEMS } from '../services/config';
import {
  saveItemToFirestore,
  removeItemFromFirestore,
  updateItemInFirestore,
  clearItemTargetPrice,
  updateNotificationEnabled,
  fetchItemsFromFirestore,
  fetchSharedProductsByIds,
  // Phase 3-A: 이중 쓰기용 신규 함수 (기존 함수는 그대로 유지)
  getCurrentUid,
  getSharedProduct,
  upsertSharedProduct,
  trackedItemToSharedProduct,
  addTrackedRef,
  removeTrackedRef,
  incrementTrackerCount,
  deleteSharedIfOrphan,
  isInvalidProductName,
} from '../services/firebase';
import {
  extractProductId,
  extractVendorItemId,
} from '../services/coupangApi';

interface AppState {
  notificationEnabled: boolean;
  hasSeenOnboarding: boolean;
  trackedItems: TrackedItem[];
  addItem: (item: TrackedItem) => Promise<void>;
  removeItem: (id: string) => void;
  /** price=undefined면 targetPrice 필드 자체를 삭제 (목표가 해제) */
  updateTargetPrice: (id: string, price: number | undefined) => void;
  syncFromFirestore: () => Promise<void>;
  backfillProductIds: () => Promise<void>;
  toggleNotification: () => void;
  completeOnboarding: () => void;
  resetAllData: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      notificationEnabled: true,
      hasSeenOnboarding: false,
      trackedItems: [],
      addItem: async (item) => {
        // Phase 3-A: 추가 전 상태에 동일 productId 중복 여부 판단 (trackerCount 중복 증가 방지)
        const alreadyTracking = item.productId
          ? useAppStore
              .getState()
              .trackedItems.some((i) => i.productId === item.productId)
          : false;

        // 추적중 탭 한도 (1.0.17 §앱구조 개편 — 10 → 20) — 중복 추가는 한도 소모 없음
        if (
          !alreadyTracking &&
          useAppStore.getState().trackedItems.length >= MAX_TRACKED_ITEMS
        ) {
          Alert.alert(
            '가격 추적 한도',
            `가격 추적은 최대 ${MAX_TRACKED_ITEMS}개까지 할 수 있어요.\n기존 상품을 삭제한 후 다시 시도해주세요.`,
          );
          return;
        }

        // 첫 추적 + productId 있을 때 shared_products 과거 메타 + priceHistory 머지.
        // cron이 누적해온 시계열을 신규 사용자도 즉시 보이게 한다.
        // 1.0.20+: Functions/검색이 메타 못 채운 경우 shared의 thumbnail/productName/apiPrice도 상속
        //   → 갤럭시 공유 등 placeholder만 들어오는 케이스 보완.
        let finalItem = item;
        if (!alreadyTracking && item.productId) {
          try {
            const snapshot = await getSharedProduct(item.productId);
            if (snapshot) {
              const patches: Partial<TrackedItem> = {};

              // 메타 상속 — local이 비어있고 shared가 유효할 때만
              if (!item.thumbnail && snapshot.thumbnail) {
                patches.thumbnail = snapshot.thumbnail;
              }
              if (
                isInvalidProductName(item.productName) &&
                !isInvalidProductName(snapshot.productName)
              ) {
                patches.productName = snapshot.productName;
              }
              const snapPrice = snapshot.apiPrice ?? snapshot.currentPrice ?? 0;
              if (item.currentPrice <= 0 && snapPrice > 0) {
                patches.currentPrice = snapPrice;
              }

              // priceHistory 머지 — 오늘자 가격은 신규/머지된 currentPrice 사용
              const sharedHist = snapshot.priceHistory ?? [];
              const effectivePrice = patches.currentPrice ?? item.currentPrice;
              if (sharedHist.length > 0) {
                const today = new Date().toISOString().slice(0, 10);
                const merged = sharedHist.map((p) => ({ ...p }));
                const last = merged[merged.length - 1];
                if (effectivePrice > 0) {
                  if (last?.date === today) {
                    last.price = effectivePrice;
                  } else {
                    merged.push({ date: today, price: effectivePrice });
                  }
                }
                patches.priceHistory = merged;
                console.log(
                  `[addItem] shared 머지 ${item.productId}: hist ${sharedHist.length} + 오늘 → ${merged.length} | ` +
                    `meta(thumb=${!!patches.thumbnail} name=${!!patches.productName} price=${patches.currentPrice ?? 'keep'})`,
                );
              } else if (Object.keys(patches).length > 0) {
                console.log(
                  `[addItem] shared 메타 상속 ${item.productId}: ` +
                    `thumb=${!!patches.thumbnail} name=${!!patches.productName} price=${patches.currentPrice ?? 'keep'}`,
                );
              }

              if (Object.keys(patches).length > 0) {
                finalItem = { ...item, ...patches };
              }
            }
          } catch (e) {
            // 머지 실패해도 단독 진행 (사용자 추가 자체는 막지 않음)
            console.warn('[addItem] shared 머지 실패 — 단독 진행:', e);
          }
        }

        set((state) => ({ trackedItems: [...state.trackedItems, finalItem] }));
        // 1.0.19 race fix: await로 Firestore 반영 보장.
        //   1.0.18 이전엔 WebView 스크래핑이 10~60s라 sync와 충돌 없었으나,
        //   1.0.19 ≤2s 추가 흐름에서는 _layout.tsx의 AppState active sync 또는 홈 sync가
        //   write 완료 전 발화 시 fetchItemsFromFirestore 결과에서 새 item 누락 → set merged로 사라지는 race 발생.
        //   await 후 router.replace 진행해 사용자 가시 카드 보장.
        await saveItemToFirestore(finalItem);

        // shared_products 이중 쓰기 (productId 있고 + 첫 추적일 때만)
        if (!alreadyTracking) {
          const shared = trackedItemToSharedProduct(finalItem);
          if (shared) {
            const uid = getCurrentUid();
            upsertSharedProduct(shared);
            if (uid) {
              addTrackedRef(uid, shared.productId, item.targetPrice);
            }
            incrementTrackerCount(shared.productId, 1);
          }
        }
      },
      removeItem: (id) => {
        // 삭제 직전 productId 포착 (필터링 이후엔 사라짐)
        const target = useAppStore
          .getState()
          .trackedItems.find((i) => i.id === id);

        set((state) => ({
          trackedItems: state.trackedItems.filter((item) => item.id !== id),
        }));
        removeItemFromFirestore(id); // 기존 경로 유지 (하위 호환)

        // Phase 3-A: 삭제 후에도 같은 productId가 남아있으면 카운터 감소 스킵 (중복 추적 보호)
        if (target?.productId) {
          const stillTracking = useAppStore
            .getState()
            .trackedItems.some((i) => i.productId === target.productId);

          if (!stillTracking) {
            const productId = target.productId;
            const uid = getCurrentUid();
            if (uid) removeTrackedRef(uid, productId);
            // 1.0.20 (docs/026 #11): 카운터 감소 → orphan 정리. 순서 보장으로 transaction이
            // decrement 반영된 trackerCount를 읽도록 await chain.
            (async () => {
              await incrementTrackerCount(productId, -1);
              await deleteSharedIfOrphan(productId);
            })();
          }
        }
      },
      updateTargetPrice: (id, price) => {
        set((state) => ({
          trackedItems: state.trackedItems.map((item) => {
            if (item.id !== id) return item;
            if (price === undefined) {
              // targetPrice 필드 자체를 제거 (목표가 해제)
              const { targetPrice: _omit, ...rest } = item;
              void _omit;
              return rest as TrackedItem;
            }
            return { ...item, targetPrice: price };
          }),
        }));
        if (price === undefined) {
          clearItemTargetPrice(id);
        } else {
          updateItemInFirestore(id, { targetPrice: price });
        }
      },
      syncFromFirestore: async () => {
        const remote = await fetchItemsFromFirestore();
        if (remote.length === 0) return;
        // 머지 정책 — 3-way (remote → local → shared):
        //   1. remote(`users/{uid}/items`) 베이스
        //   2. local 보존: local.priceHistory가 remote보다 길면 local 채택 (과거 currentPrice-only 저장 데이터 보호)
        //   3. shared 보존: cron이 누적하는 shared.priceHistory가 더 길면 shared 채택 (apiPrice 시계열 단일 출처)
        const local = useAppStore.getState().trackedItems;
        const localById = new Map(local.map((i) => [i.id, i]));

        // shared_products 다건 조회 — productId 보유 항목만 (홈 N=10이라 비용 미미)
        const productIds = remote
          .map((r) => r.productId)
          .filter((p): p is string => !!p);
        const sharedById =
          productIds.length > 0
            ? await fetchSharedProductsByIds(productIds)
            : new Map();

        const merged = remote.map((r) => {
          const l = localById.get(r.id);
          // Step 1+2: local vs remote
          let m =
            l && l.priceHistory.length > r.priceHistory.length
              ? {
                  ...r,
                  priceHistory: l.priceHistory,
                  currentPrice: l.currentPrice,
                }
              : r;

          // Step 3: shared 우선 (cron이 매 사이클 apiPrice 누적)
          // priceHistory와 currentPrice 분리 머지 — currentPrice는 길이 무관 신선값 채택.
          const shared = r.productId ? sharedById.get(r.productId) : undefined;
          if (shared) {
            const sharedHistLen = shared.priceHistory?.length ?? 0;
            if (sharedHistLen > m.priceHistory.length) {
              m = { ...m, priceHistory: shared.priceHistory };
            }
            const sharedPrice = shared.apiPrice ?? shared.currentPrice;
            if (
              typeof sharedPrice === 'number' &&
              sharedPrice > 0 &&
              sharedPrice !== m.currentPrice
            ) {
              m = { ...m, currentPrice: sharedPrice };
            }
          }

          return m;
        });
        set({ trackedItems: merged });
        // fresh fetch 결과에 productId 누락이 섞여 있어도 자가 보정
        useAppStore.getState().backfillProductIds();
      },
      /**
       * productId 누락 trackedItem을 url/resolvedUrl에서 재추출해 자가 치유.
       * 기존 추가 시점에 단축 URL resolve 실패로 productId 비어 저장된 케이스가
       * 하트 버튼을 못 보이게 하므로(useFavoriteToggle.enabled=false) 진입 시 1회 보정.
       * shared_products 카운터는 다른 단말 중복 증가 위험으로 건드리지 않음.
       */
      backfillProductIds: async () => {
        const items = useAppStore.getState().trackedItems;
        const patches: { id: string; productId?: string; vendorItemId?: string }[] = [];
        for (const it of items) {
          if (it.productId) continue;
          const candidates = [it.resolvedUrl, it.url];
          let pid: string | undefined;
          let vid: string | undefined;
          for (const u of candidates) {
            if (!u) continue;
            if (!pid) {
              const v = extractProductId(u);
              if (v) pid = v;
            }
            if (!vid) {
              const v = extractVendorItemId(u);
              if (v) vid = v;
            }
            if (pid && vid) break;
          }
          if (pid) patches.push({ id: it.id, productId: pid, vendorItemId: vid });
        }
        if (patches.length === 0) return;
        set((state) => ({
          trackedItems: state.trackedItems.map((it) => {
            const p = patches.find((x) => x.id === it.id);
            return p
              ? { ...it, productId: p.productId, vendorItemId: p.vendorItemId ?? it.vendorItemId }
              : it;
          }),
        }));
        await Promise.all(
          patches.map((p) =>
            updateItemInFirestore(p.id, {
              productId: p.productId,
              ...(p.vendorItemId ? { vendorItemId: p.vendorItemId } : {}),
            }),
          ),
        );
      },
      completeOnboarding: () => set({ hasSeenOnboarding: true }),
      toggleNotification: () =>
        set((state) => {
          const next = !state.notificationEnabled;
          updateNotificationEnabled(next);
          return { notificationEnabled: next };
        }),
      resetAllData: async () => {
        const { trackedItems: items } = useAppStore.getState();
        for (const item of items) {
          removeItemFromFirestore(item.id);
        }
        set({
          trackedItems: [],
          notificationEnabled: true,
        });
        await AsyncStorage.removeItem('jonber-alimi-storage');
      },
    }),
    {
      name: 'jonber-alimi-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
