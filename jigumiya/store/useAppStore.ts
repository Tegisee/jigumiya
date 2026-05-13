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
  fetchSharedProductsByIds,
  // Phase 3-A: 이중 쓰기용 신규 함수 (기존 함수는 그대로 유지)
  getCurrentUid,
  getSharedProduct,
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
  addItem: (item: TrackedItem) => Promise<void>;
  removeItem: (id: string) => void;
  updateTargetPrice: (id: string, price: number) => void;
  updateItemPrice: (id: string, price: number) => void;
  /** 1.0.17: WebView 가격 체크 시도 시점 기록 (성공/실패/차단 무관). PriceChecker TTL 6h 가드용 */
  markChecked: (id: string) => void;
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

        // 1A (docs/023): 첫 추적 + productId 있을 때 shared_products 과거 이력 머지.
        // cron이 누적해온 priceHistory를 신규 사용자도 즉시 보이게 한다. 오늘자 가격은
        // WebView 결과(item.currentPrice)가 더 신선하므로 같은 날짜면 덮어쓰고 아니면 append.
        // lowestPrice/highestPrice는 detail 화면이 priceHistory에서 derive하므로 별도 보존 불필요.
        let finalItem = item;
        if (!alreadyTracking && item.productId) {
          try {
            const snapshot = await getSharedProduct(item.productId);
            const sharedHist = snapshot?.priceHistory ?? [];
            if (sharedHist.length > 0) {
              const today = new Date().toISOString().slice(0, 10);
              const merged = sharedHist.map((p) => ({ ...p }));
              const last = merged[merged.length - 1];
              if (item.currentPrice > 0) {
                if (last?.date === today) {
                  last.price = item.currentPrice;
                } else {
                  merged.push({ date: today, price: item.currentPrice });
                }
              }
              finalItem = { ...item, priceHistory: merged };
              console.log(
                `[addItem] shared 머지 ${item.productId}: ${sharedHist.length}건 + 오늘 → ${merged.length}건`,
              );
            }
          } catch (e) {
            // 머지 실패해도 단독 진행 (사용자 추가 자체는 막지 않음)
            console.warn('[addItem] shared 머지 실패 — 단독 진행:', e);
          }
        }

        set((state) => ({ trackedItems: [...state.trackedItems, finalItem] }));
        saveItemToFirestore(finalItem); // 기존 경로 유지 (하위 호환) — 머지된 priceHistory도 함께 저장

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
        // Firestore에 함께 저장할 최신 priceHistory를 외부 변수로 캡처
        // (set 콜백 내부에서 만들어지지만 updateItemInFirestore에도 동일 값 전달 필요)
        let nextHistory: { date: string; price: number }[] | null = null;
        let productId: string | undefined;
        set((state) => ({
          trackedItems: state.trackedItems.map((item) => {
            if (item.id !== id || newPrice === 0) return item;
            productId = item.productId;
            const history = [...item.priceHistory];
            const last = history[history.length - 1];
            if (last?.date === today) {
              last.price = newPrice;
            } else {
              history.push({ date: today, price: newPrice });
            }
            const sliced = history.slice(-30);
            nextHistory = sliced;
            return {
              ...item,
              currentPrice: newPrice,
              priceHistory: sliced,
            };
          }),
        }));
        // priceHistory 누락 시 백그라운드 복귀 후 syncFromFirestore가 store를 덮어쓸 때
        // 누적 그래프가 1개로 리셋되는 사고 방어 (이전: currentPrice만 저장)
        updateItemInFirestore(id, {
          currentPrice: newPrice,
          ...(nextHistory ? { priceHistory: nextHistory } : {}),
        });
        // 1B (docs/023): WebView 결과는 사실상 realPrice → shared_products 역방향 mirror.
        // cron은 lastRealPriceUpdatedAt 확인해 최근 WebView 갱신 있으면 apiPrice 호출 skip.
        // needsCheck는 CF onUpdate 트리거가 알림 검토 후 클리어할 책임이라 미터치.
        if (productId && nextHistory) {
          upsertSharedProduct({
            productId,
            realPrice: newPrice,
            lastRealPriceUpdatedAt: Date.now(),
          });
        }
      },
      markChecked: (id) => {
        // 1.0.17: WebView 가격 체크 시도 시점 기록 (성공/실패/차단 무관).
        // PriceChecker TTL 6h 가드 + detail/관리자 수동 새로고침의 차단 폭주 방어.
        // Firestore 미저장 (클라이언트 전용) — zustand persist로 AsyncStorage 자동 저장.
        const now = Date.now();
        set((state) => ({
          trackedItems: state.trackedItems.map((item) =>
            item.id === id ? { ...item, lastWebViewCheckedAt: now } : item,
          ),
        }));
      },
      syncFromFirestore: async () => {
        const remote = await fetchItemsFromFirestore();
        if (remote.length === 0) return;
        // 머지 정책 — 3-way (remote → local → shared):
        //   1. remote(`users/{uid}/items`) 베이스
        //   2. local 보존 (5/7 Fix B): local.priceHistory가 remote보다 길면 local 채택
        //      → updateItemPrice가 currentPrice만 Firestore에 저장하던 시기 데이터 보호
        //   3. shared 보존 (Issue 1, 2026-05-10): shared.priceHistory가 (1+2 머지값)보다 길면 shared 채택
        //      → cron(`shared-price-checker`)이 매 사이클 priceHistory 누적하므로 신선한 출처
        //      currentPrice는 1B(docs/023) 도입 후 realPrice 우선 + legacy currentPrice fallback.
        //      shared.realPrice는 앱 WebView가 mirror하는 가장 정확한 가격, shared.currentPrice는
        //      cron이 과거 apiPrice를 mirror하던 시기 호환 경로.
        //   ※ priceHistory 스키마({date, price}→{date, realPrice})는 cron의 realPrice 기록 전환과 함께
        //      별도 task에서 일괄 변환 예정. 현재는 length 비교 정책만 유지.
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

          // Step 3: shared 우선 (cron 누적 + 앱 WebView mirror 출처)
          // 2026-05-11 split: priceHistory와 currentPrice를 분리 머지.
          //   - priceHistory: length 비교 정책 유지 (안전 — 기존 사용자 local 보존)
          //   - currentPrice: shared.realPrice 우선 채택 (길이 무관) — realPrice 갱신만 있고
          //     priceHistory 길이는 그대로인 케이스(cron 1h 가드 skip 등)에 currentPrice 누락
          //     되어 "자동 새로고침 일부만 동작" 증상 발생하던 버그 수정.
          const shared = r.productId ? sharedById.get(r.productId) : undefined;
          if (shared) {
            const sharedHistLen = shared.priceHistory?.length ?? 0;
            if (sharedHistLen > m.priceHistory.length) {
              m = { ...m, priceHistory: shared.priceHistory };
            }
            const sharedPrice = shared.realPrice ?? shared.currentPrice;
            if (
              typeof sharedPrice === 'number' &&
              sharedPrice > 0 &&
              sharedPrice !== m.currentPrice
            ) {
              m = { ...m, currentPrice: sharedPrice };
            }
          }

          // 1.0.17: lastWebViewCheckedAt은 Firestore 미저장 클라이언트 전용 필드 (PriceChecker TTL 가드 baseline).
          // remote/shared 머지가 baseline이라 손실되면 sync마다 TTL 가드 무력 → Akamai 차단 폭주.
          // local 값이 있으면 보존 (없으면 미설정 — 신규/미체크 상품으로 자연 처리).
          if (l?.lastWebViewCheckedAt) {
            m = { ...m, lastWebViewCheckedAt: l.lastWebViewCheckedAt };
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
