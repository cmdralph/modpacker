import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { createStore, useStore } from '../../state/store';
import { cx } from './primitives';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

type ToastStoreAction = { type: 'push'; toast: Toast } | { type: 'dismiss'; id: number };

const toastStore = createStore<Toast[], ToastStoreAction>((state, action) => {
  if (action.type === 'push') return [...state.slice(-4), action.toast];
  return state.filter((t) => t.id !== action.id);
}, []);

let nextId = 1;

const dismiss = (id: number) => toastStore.dispatch({ type: 'dismiss', id });

export function toast(kind: ToastKind, message: string, options: { action?: ToastAction; durationMs?: number } = {}): void {
  const id = nextId++;
  toastStore.dispatch({ type: 'push', toast: { id, kind, message, action: options.action } });
  setTimeout(() => dismiss(id), options.durationMs ?? (kind === 'error' || options.action ? 8000 : 5000));
}

const STYLES: Record<ToastKind, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-sky-300' },
  success: { icon: CircleCheck, className: 'text-accent-300' },
  warning: { icon: TriangleAlert, className: 'text-amber-300' },
  error: { icon: CircleAlert, className: 'text-rose-300' },
};

export function Toaster() {
  const toasts = useStore(toastStore, (s) => s);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
      {toasts.map((t) => {
        const { icon: Icon, className } = STYLES[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-base-800/95 p-3 text-sm text-base-100 shadow-xl ring-1 ring-base-700 backdrop-blur animate-fade-in"
          >
            <Icon className={cx('mt-0.5 size-4 shrink-0', className)} aria-hidden />
            <p className="flex-1 leading-snug">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold text-accent-300 ring-1 ring-inset ring-accent-500/40 hover:bg-accent-500/10"
              >
                {t.action.label}
              </button>
            )}
            <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-base-400 hover:text-base-50" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
