import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Icon } from './Icons';

export interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  resolve?: (ok: boolean) => void;
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  close: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { title: '' },
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, options, resolve });
    }),
  close: (ok) => {
    const r = get().resolve;
    set({ open: false, resolve: undefined });
    r?.(ok);
  },
}));

/** Promise-based replacement for the native confirm(). */
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().ask(opts);

export function ConfirmHost() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const close = useConfirmStore((s) => s.close);
  const [leaving, setLeaving] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const doClose = useCallback(
    (ok: boolean) => {
      if (leaving) return;
      setLeaving(true);
      window.setTimeout(() => {
        setLeaving(false);
        close(ok);
      }, 160);
    },
    [close, leaving],
  );

  useEffect(() => {
    if (!open) return;
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        doClose(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, doClose]);

  if (!open) return null;

  const danger = options.danger !== false;
  const confirmText = options.confirmText ?? '确认';
  const cancelText = options.cancelText ?? '取消';

  return (
    <div
      className={`modal-backdrop ${leaving ? 'leaving' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) doClose(false);
      }}
    >
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-label={options.title}>
        <div className="confirm-head">
          <span className="confirm-icon">
            <Icon name={danger ? 'alert-triangle' : 'info'} size={19} />
          </span>
          <span className="confirm-title">{options.title}</span>
        </div>
        {options.body && <div className="confirm-body">{options.body}</div>}
        <div className="confirm-actions" style={{ marginLeft: options.body ? 0 : 50 }}>
          <button onClick={() => doClose(false)}>{cancelText}</button>
          <button
            ref={confirmBtnRef}
            className={danger ? 'danger' : 'primary'}
            onClick={() => doClose(true)}
            style={danger ? { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)', padding: '7px 16px' } : undefined}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
