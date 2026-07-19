import { create } from 'zustand';

/**
 * Estado global de UI. Deliberadamente pequeno.
 * Coisas com storage no servidor vão via TanStack Query, não aqui.
 */

type UiState = {
  runningTasks: number;
  incrementRunningTasks: () => void;
  decrementRunningTasks: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  runningTasks: 0,
  incrementRunningTasks: () => set((s) => ({ runningTasks: s.runningTasks + 1 })),
  decrementRunningTasks: () => set((s) => ({ runningTasks: Math.max(0, s.runningTasks - 1) })),
}));
