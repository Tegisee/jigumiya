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
  updateNotificationEnabled,
  fetchItemsFromFirestore,
  // Phase 3-A: 이중 쓰기용 신규 함수 (기존 함수는 그대로 유지)
  getCurrentUid,
  upsertSharedProduct,
  trackedItemToSharedProduct,
  addTrackedRef,
  removeTrackedRef,
  incrementTrackerCount,
} from '../services/firebase';
import {
  extractProductId,
  extractVendorItemId,
} from '../services/coupangApi';

interface AppState {
  notificationEnabled: boolean;
  hasSeenOnboarding: boolean;
  trackedItems: TrackedItem[];
  addItem: (item: TrackedItem) => void;
  removeItem: (id: string) => void;
  updateTargetPrice: (id: string, price: number) => void;
  updateItemPrice: (id: string, price: number) => void;
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
      addItem: (item) => {
        // Phase 3-A: 추가 전 상태에 동일 productId 중복 여부 판단 (trackerCount 중복 증가 방지)
        const alreadyTracking = item.productId
          ? useAppStore
              .getState()
              .trackedItems.some((i) => i.productId === item.productId)
          : false;

        // Phase 3 §4: 홈 10개 제한 — 중복 추가는 한도 소모 없음
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

        set((state) => ({ trackedItems: [...state.trackedItems, item] }));
        saveItemToFirestore(item); // 기존 경로 유지 (하위 호환)

        // shared_products 이중 쓰기 (productId 있고 + 첫 추적일 때만)
        if (!alreadyTracking) {
          const shared = trackedItemToSharedProduct(item);
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
            const uid = getCurrentUid();
            if (uid) removeTrackedRef(uid, target.productId);
            incrementTrackerCount(target.productId, -1);
          }
        }
      },
      updateTargetPrice: (id, price) => {
        set((state) => ({
          trackedItems: state.trackedItems.map((item) =>
            item.id === id ? { ...item, targetPrice: price } : item,
          ),
        }));
        updateItemInFirestore(id, { targetPrice: price });
      },
      updateItemPrice: (id, newPrice) => {
        const today = new Date().toISOString().slice(0, 10);
        set((state) => ({
          trackedItems: state.trackedItems.map((item) => {
            if (item.id !== id || newPrice === 0) return item;
            const history = [...item.priceHistory];
            const last = history[history.length - 1];
            if (last?.date === today) {
              last.price = newPrice;
            } else {
              history.push({ date: today, price: newPrice });
            }
            return {
              ...item,
              currentPrice: newPrice,
              priceHistory: history.slice(-30),
            };
          }),
        }));
        updateItemInFirestore(id, {
          currentPrice: newPrice,
        });
      },
      syncFromFirestore: async () => {
        const items = await fetchItemsFromFirestore();
        if (items.length > 0) {
          set({ trackedItems: items });
          // fresh fetch 결과에 productId 누락이 섞여 있어도 자가 보정
          useAppStore.getState().backfillProductIds();
        }
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
