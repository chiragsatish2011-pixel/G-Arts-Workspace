import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
export type ContextPanel = 'none' | 'about' | 'people' | 'pinned' | 'search';

interface LightboxItem {
  url: string;
  fileName: string;
  mimeType: string;
}

interface UIState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  panel: ContextPanel;
  paletteOpen: boolean;
  composerOpen: boolean;
  sidebarOpen: boolean;
  lightbox: { items: LightboxItem[]; index: number } | null;
  /** Set when a pinned or search result asks the reader to be taken to it. */
  jumpTarget: { channelId: string; messageId: string } | null;
  soundEnabled: boolean;
  toast: { id: number; message: string; tone: 'info' | 'error' | 'success' } | null;

  setTheme: (theme: Theme) => void;
  togglePanel: (panel: ContextPanel) => void;
  setPanel: (panel: ContextPanel) => void;
  setPalette: (open: boolean) => void;
  setComposerOpen: (open: boolean) => void;
  setSidebar: (open: boolean) => void;
  jumpToMessage: (channelId: string, messageId: string) => void;
  clearJumpTarget: () => void;
  openLightbox: (items: LightboxItem[], index: number) => void;
  closeLightbox: () => void;
  toggleSound: () => void;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
  dismissToast: () => void;
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
}

function apply(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#1a1614' : '#fbf8f3');
}

const stored = (localStorage.getItem('garts-theme') as Theme) ?? 'light';
apply(resolve(stored));

export const useUIStore = create<UIState>((set, get) => {
  // Following the system theme means reacting to it changing, not only
  // reading it once at boot.
  media.addEventListener('change', () => {
    if (get().theme !== 'system') return;
    const resolved = resolve('system');
    apply(resolved);
    set({ resolvedTheme: resolved });
  });

  return {
    theme: stored,
    resolvedTheme: resolve(stored),
    panel: 'none',
    paletteOpen: false,
    composerOpen: false,
    sidebarOpen: false,
    lightbox: null,
    jumpTarget: null,
    soundEnabled: localStorage.getItem('garts-sound') !== 'off',
    toast: null,

    setTheme: (theme) => {
      localStorage.setItem('garts-theme', theme);
      const resolved = resolve(theme);
      apply(resolved);
      set({ theme, resolvedTheme: resolved });
    },

    togglePanel: (panel) => set((s) => ({ panel: s.panel === 'none' ? panel : 'none' })),
    setPanel: (panel) => set({ panel }),
    setPalette: (paletteOpen) => set({ paletteOpen }),
    setComposerOpen: (composerOpen) => set({ composerOpen }),
    setSidebar: (sidebarOpen) => set({ sidebarOpen }),

    jumpToMessage: (channelId, messageId) => set({ jumpTarget: { channelId, messageId } }),
    clearJumpTarget: () => set({ jumpTarget: null }),

    openLightbox: (items, index) => set({ lightbox: { items, index } }),
    closeLightbox: () => set({ lightbox: null }),

    toggleSound: () =>
      set((s) => {
        localStorage.setItem('garts-sound', s.soundEnabled ? 'off' : 'on');
        return { soundEnabled: !s.soundEnabled };
      }),

    notify: (message, tone = 'info') => {
      set({ toast: { id: Date.now(), message, tone } });
      setTimeout(() => {
        if (get().toast?.message === message) set({ toast: null });
      }, 4000);
    },

    dismissToast: () => set({ toast: null })
  };
});
