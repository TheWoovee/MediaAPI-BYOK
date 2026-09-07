import { create } from 'zustand';
import type { Theme } from '../lib/theme';
import { getStoredTheme, setStoredTheme, applyTheme } from '../lib/theme';

interface AppState {
  theme: Theme;
  email: string | null;
  online: boolean;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;

  setTheme(t: Theme): void;
  setEmail(e: string | null): void;
  setOnline(v: boolean): void;
  toggleSidebar(): void;
  setInspectorOpen(v: boolean): void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: getStoredTheme(),
  email: null,
  online: navigator.onLine,
  sidebarCollapsed: false,
  inspectorOpen: true,

  setTheme(t: Theme) {
    setStoredTheme(t);
    applyTheme(t);
    set({ theme: t });
  },

  setEmail(e: string | null) {
    set({ email: e });
  },

  setOnline(v: boolean) {
    set({ online: v });
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
  },

  setInspectorOpen(v: boolean) {
    set({ inspectorOpen: v });
  },
}));
