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
  trackedItems: TrackedItem[];
  addItem: (item: TrackedItem) => void;
  removeItem: (id: string) => void;
  updateTargetPrice: (id: string, price: number) => void;
  syncFromFirestore: () => Promise<void>;
  toggleWowMember: () => void;
  toggleNotification: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isWowMember: false,
      notificationEnabled: true,
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
      syncFromFirestore: async () => {
        const items = await fetchItemsFromFirestore();
        if (items.length > 0) {
          set({ trackedItems: items });
        }
      },
      toggleWowMember: () =>
        set((state) => ({ isWowMember: !state.isWowMember })),
      toggleNotification: () =>
        set((state) => {
          const next = !state.notificationEnabled;
          updateNotificationEnabled(next);
          return { notificationEnabled: next };
        }),
    }),
    {
      name: 'jonber-alimi-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
