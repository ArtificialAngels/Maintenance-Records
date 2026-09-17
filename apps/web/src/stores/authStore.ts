import { create } from 'zustand';
import type { User } from '../lib/types';
import { api } from '../lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  loginAs: (userId: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,
  async loginAs(userId) {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.login(userId);
      localStorage.setItem('mr.token', token);
      localStorage.setItem('mr.user', JSON.stringify(user));
      set({ token, user, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      throw err;
    }
  },
  logout() {
    localStorage.removeItem('mr.token');
    localStorage.removeItem('mr.user');
    set({ user: null, token: null });
  },
  hydrate() {
    const token = localStorage.getItem('mr.token');
    const userRaw = localStorage.getItem('mr.user');
    if (token && userRaw) {
      try {
        set({ token, user: JSON.parse(userRaw) as User });
      } catch {
        /* ignore */
      }
    }
  },
}));