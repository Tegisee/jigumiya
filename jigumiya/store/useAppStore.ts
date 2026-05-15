import { Alert } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackedItem, PriceStatus } from '../types';
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
        //
        // 1.0.19 §2 (docs/025) priceStatus 상속:
        //   - 기존 shared 문서 존재 시 → snapshot.priceStatus 그대로 상속 (snapshot 없으면 'TRACKING' legacy fallback)
        //   - shared 문서 없음 → item.priceStatus 유지 (add-item.tsx가 'INIT'으로 세팅)
        let finalItem = item;
        if (!alreadyTracking && item.productId) {
          try {
            const snapshot = await getSharedProduct(item.productId);
            if (snapshot) {
              const sharedHist = snapshot.priceHistory ?? [];
              let mergedHistory = item.priceHistory;
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
                mergedHistory = merged;
                console.log(
                  `[addItem] shared 머지 ${item.productId}: ${sharedHist.length}건 + 오늘 → ${merged.length}건`,
                );
              }
              finalItem = {
                ...item,
                priceHistory: mergedHistory,
                // snapshot에 priceStatus 없으면 'TRACKING'으로 간주 (1.0.18 이전 문서 호환)
                priceStatus: snapshot.priceStatus ?? 'TRACKING',
                apiPrice: snapshot.apiPrice ?? item.apiPrice,
              };
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
        if (newPrice <= 0) return;
        const today = new Date().toISOString().slice(0, 10);
        const now = Date.now();
        // 1.0.19 §2 (docs/025) — realPrice write 시 INIT → SYNCING → TRACKING 자동 전이.
        // 외부 캡처 변수로 set 콜백 결과를 받아 Firestore/shared 쓰기에 동일 값 전달.
        let nextHistory: { date: string; price: number }[] | null = null;
        let productId: string | undefined;
        let nextStatus: 'INIT' | 'SYNCING' | 'TRACKING' | undefined;
        let firstRealPriceAt: number | undefined;
        let trackingStartedAt: number | undefined;
        set((state) => ({
          trackedItems: state.trackedItems.map((item) => {
            if (item.id !== id) return item;
            productId = item.productId;
            // legacy 호환: priceStatus 미설정 = 마이그레이션 전 기존 상품 → 'TRACKING'으로 간주
            const currentStatus = item.priceStatus ?? 'TRACKING';

            if (currentStatus === 'INIT') {
              // SYNCING 전이 — baseline 통일(currentPrice=realPrice), priceHistory 1점 시작
              nextStatus = 'SYNCING';
              firstRealPriceAt = now;
              nextHistory = [{ date: today, price: newPrice }];
              return {
                ...item,
                currentPrice: newPrice,
                priceHistory: nextHistory,
                priceStatus: 'SYNCING' as const,
                firstRealPriceAt: now,
              };
            }

            if (currentStatus === 'SYNCING') {
              // TRACKING 전이 — 두 번째 realPrice 도착. 그래프 누적 시작.
              nextStatus = 'TRACKING';
              trackingStartedAt = now;
              const history = [...item.priceHistory];
              const last = history[history.length - 1];
              if (last?.date === today) {
                last.price = newPrice;
              } else {
                history.push({ date: today, price: newPrice });
              }
              nextHistory = history.slice(-30);
              return {
                ...item,
                currentPrice: newPrice,
                priceHistory: nextHistory,
                priceStatus: 'TRACKING' as const,
                trackingStartedAt: now,
              };
            }

            // TRACKING (또는 legacy fallback) — 기존 동작 유지
            const history = [...item.priceHistory];
            const last = history[history.length - 1];
            if (last?.date === today) {
              last.price = newPrice;
            } else {
              history.push({ date: today, price: newPrice });
            }
            nextHistory = history.slice(-30);
            return {
              ...item,
              currentPrice: newPrice,
              priceHistory: nextHistory,
            };
          }),
        }));

        if (!nextHistory) return;

        // priceHistory 누락 시 백그라운드 복귀 후 syncFromFirestore가 store를 덮어쓸 때
        // 누적 그래프가 1개로 리셋되는 사고 방어 (이전: currentPrice만 저장)
        updateItemInFirestore(id, {
          currentPrice: newPrice,
          priceHistory: nextHistory,
          ...(nextStatus ? { priceStatus: nextStatus } : {}),
          ...(firstRealPriceAt ? { firstRealPriceAt } : {}),
          ...(trackingStartedAt ? { trackingStartedAt } : {}),
        });
        // 1B (docs/023): WebView 결과는 사실상 realPrice → shared_products 역방향 mirror.
        // cron은 lastRealPriceUpdatedAt 확인해 최근 WebView 갱신 있으면 apiPrice 호출 skip.
        // needsCheck는 CF onUpdate 트리거가 알림 검토 후 클리어할 책임이라 미터치.
        // 1.0.19 §2: priceStatus 전이 시 timestamps도 shared에 mirror (CF 트리거가 후속 알림 가드에 사용).
        if (productId) {
          upsertSharedProduct({
            productId,
            realPrice: newPrice,
            lastRealPriceUpdatedAt: now,
            ...(nextStatus ? { priceStatus: nextStatus } : {}),
            ...(firstRealPriceAt ? { firstRealPriceAt } : {}),
            ...(trackingStartedAt ? { trackingStartedAt } : {}),
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

          // 1.0.19 §2 (docs/025) priceStatus 머지 — "더 진행된 상태 우선" 규칙.
          //   INIT(0) < SYNCING(1) < TRACKING(2). undefined는 legacy 미마이그 문서로 'TRACKING' 간주.
          //   네트워크 실패로 local-only 전이가 발생한 경우 remote/shared가 더 낮은 상태로 덮어쓰지 않도록 보호.
          //   timestamps도 채택된 출처에서 함께 가져옴 — 일부 누락 시 다음 sync에서 자가 회복.
          const statusRank = (s?: PriceStatus): number =>
            s === 'TRACKING' || s === undefined ? 2 : s === 'SYNCING' ? 1 : 0;
          type StatusCand = {
            status?: PriceStatus;
            firstRealPriceAt?: number;
            trackingStartedAt?: number;
          };
          const cands: StatusCand[] = [
            { status: r.priceStatus, firstRealPriceAt: r.firstRealPriceAt, trackingStartedAt: r.trackingStartedAt },
          ];
          if (l) {
            cands.push({ status: l.priceStatus, firstRealPriceAt: l.firstRealPriceAt, trackingStartedAt: l.trackingStartedAt });
          }
          if (shared) {
            cands.push({
              status: shared.priceStatus,
              firstRealPriceAt: shared.firstRealPriceAt,
              trackingStartedAt: shared.trackingStartedAt,
            });
          }
          const best = cands.reduce((acc, c) =>
            statusRank(c.status) > statusRank(acc.status) ? c : acc,
          );
          m = {
            ...m,
            ...(best.status ? { priceStatus: best.status } : {}),
            ...(best.firstRealPriceAt ? { firstRealPriceAt: best.firstRealPriceAt } : {}),
            ...(best.trackingStartedAt ? { trackingStartedAt: best.trackingStartedAt } : {}),
          };
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
