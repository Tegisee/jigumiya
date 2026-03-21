import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackedItem } from '../types';
import {
  saveItemToFirestore,
  removeItemFromFirestore,
  updateItemInFirestore,
  updateNotificationEnabled,
  fetchItemsFromFirestore,
} from '../services/firebase';

interface AppState {
  isWowMember: boolean;
  notificationEnabled: boolean;
  hasSeenOnboarding: boolean;
  trackedItems: TrackedItem[];
  addItem: (item: TrackedItem) => void;
  removeItem: (id: string) => void;
  updateTargetPrice: (id: string, price: number) => void;
  updateItemPrice: (id: string, price: number) => void;
  syncFromFirestore: () => Promise<void>;
  toggleWowMember: () => void;
  toggleNotification: () => void;
  completeOnboarding: () => void;
  resetAllData: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isWowMember: false,
      notificationEnabled: true,
      hasSeenOnboarding: false,
      trackedItems: [],
      addItem: (item) => {
        set((state) => ({ trackedItems: [...state.trackedItems, item] }));
        saveItemToFirestore(item);
      },
      removeItem: (id) => {
        set((state) => ({
          trackedItems: state.trackedItems.filter((item) => item.id !== id),
        }));
        removeItemFromFirestore(id);
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
        }
      },
      toggleWowMember: () =>
        set((state) => ({ isWowMember: !state.isWowMember })),
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
          isWowMember: false,
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
