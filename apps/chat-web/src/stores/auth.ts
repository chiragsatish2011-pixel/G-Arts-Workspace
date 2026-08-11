import { create } from 'zustand';
import type { User } from '@g-arts/chat-shared';
import api, { errorMessage, setAccessToken, getAccessToken } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { isEmbedded, requestWorkspaceSession } from '../lib/embed';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  updateProfile: (patch: Partial<User> & { bio?: string | null }) => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // The session lives in an httpOnly refresh cookie, not in localStorage, so
  // the user object is always re-fetched rather than persisted and trusted.
  user: null,
  isLoading: false,
  isRestoring: true,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { username, password });
      setAccessToken(data.accessToken);
      set({ user: data.user, isLoading: false });
      connectSocket();
      return true;
    } catch (err) {
      set({ error: errorMessage(err, 'Sign-in failed'), isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Signing out locally must succeed even if the request does not.
    }
    disconnectSocket();
    setAccessToken(null);
    localStorage.removeItem('garts-outbox');
    set({ user: null });
  },

  /**
   * Re-establishes the session on load. If the access token is stale the
   * interceptor silently refreshes it from the cookie, so a returning member
   * lands straight in the app.
   */
  restore: async () => {
    set({ isRestoring: true });
    try {
      // Inside the Workspace shell the session is handed to us, so there is no
      // second sign-in and no refresh cookie of our own to rotate.
      if (isEmbedded) {
        const token = await requestWorkspaceSession();
        if (!token) {
          set({ user: null, isRestoring: false });
          return;
        }
        const { data } = await api.get('/auth/me');
        set({ user: data.user, isRestoring: false });
        connectSocket();
        return;
      }

      if (!getAccessToken()) {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
      }
      const { data } = await api.get('/auth/me');
      set({ user: data.user, isRestoring: false });
      connectSocket();
    } catch {
      setAccessToken(null);
      set({ user: null, isRestoring: false });
    }
  },

  updateProfile: async (patch) => {
    try {
      const { data } = await api.patch('/users/me', patch);
      set({ user: { ...get().user, ...data.user } as User });
      return true;
    } catch (err) {
      set({ error: errorMessage(err, 'Could not save your profile') });
      return false;
    }
  },

  clearError: () => set({ error: null })
}));
