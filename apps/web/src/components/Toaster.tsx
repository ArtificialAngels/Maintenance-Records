import { useEffect } from 'react';
import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  items: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = `t_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ items: [...s.items, { id, kind, message }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
    }, 3200);
  },
  dismiss: (id) =>
    set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (msg: string) => useToastStore.getState().push('success', msg),
  error: (msg: string) => useToastStore.getState().push('error', msg),
  info: (msg: string) => useToastStore.getState().push('info', msg),
};

const ICON: Record<ToastKind, string> = { success: '✓', error: '!', info: 'i' };

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    // Force re-render on changes — no-op body, just ensures subscriptions.
  }, [items]);
  if (items.length === 0) return null;
  return (
    <div className="toast-host">
      {items.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          role="status"
          onClick={() => dismiss(t.id)}
        >
          <span className="icon">{ICON[t.kind]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}