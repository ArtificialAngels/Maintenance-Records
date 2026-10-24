import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Icon, type IconName } from './Icons';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** 自动消失时长（毫秒），默认 3200 */
  duration: number;
}

interface ToastStore {
  items: ToastItem[];
  push: (kind: ToastKind, message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION = 3200;

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (kind, message, duration = DEFAULT_DURATION) => {
    const id = `t_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ items: [...s.items, { id, kind, message, duration }] }));
  },
  dismiss: (id) =>
    set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (msg: string, duration?: number) => useToastStore.getState().push('success', msg, duration),
  error: (msg: string, duration?: number) => useToastStore.getState().push('error', msg, duration ?? 5000),
  info: (msg: string, duration?: number) => useToastStore.getState().push('info', msg, duration),
};

const ICON_NAME: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'x',
  info: 'info',
};

/** Single toast with pause-on-hover, exit animation and a manual close button. */
function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(toast.duration);
  const startedAt = useRef(Date.now());
  const timer = useRef<number | null>(null);

  const remove = useCallback(() => {
    if (!leaving) setLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), 200);
  }, [leaving, onDismiss, toast.id]);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    startedAt.current = Date.now();
    timer.current = window.setTimeout(remove, remaining.current);
  }, [clearTimer, remove]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer, clearTimer]);

  function pause() {
    if (leaving) return;
    remaining.current = Math.max(remaining.current - (Date.now() - startedAt.current), 300);
    clearTimer();
  }

  function resume() {
    if (leaving) return;
    startTimer();
  }

  return (
    <div
      className={`toast ${toast.kind} ${leaving ? 'leaving' : ''}`}
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      <span className="icon">
        <Icon name={ICON_NAME[toast.kind]} size={13} strokeWidth={3} />
      </span>
      <span className="toast-msg">{toast.message}</span>
      <button
        className="toast-close"
        onClick={remove}
        title="关闭"
        aria-label="关闭提示"
      >
        <Icon name="x" size={13} />
      </button>
      <span
        className="toast-progress"
        style={{ animationDuration: `${toast.duration}ms` }}
      />
    </div>
  );
}

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  if (items.length === 0) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
