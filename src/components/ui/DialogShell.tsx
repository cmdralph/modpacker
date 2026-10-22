import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { createStore } from '../../state/store';
import { cx } from './primitives';

/**
 * Open dialogs, top-most last. Everything outside the top modal dialog is inert, so toasts are
 * rendered inside it (see Toaster) to stay clickable.
 */
export const dialogStack = createStore<HTMLDialogElement[], { open: HTMLDialogElement } | { close: HTMLDialogElement }>(
  (stack, action) => ('open' in action ? [...stack, action.open] : stack.filter((d) => d !== action.close)),
  [],
);

interface DialogShellProps {
  onClose: () => void;
  /** Classes for the full-viewport layer that positions the panel. */
  layoutClassName: string;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  label?: string;
}

/**
 * Native `<dialog>` opened with `showModal()`: it renders in the browser's top layer (so stacking
 * order is always "last opened on top"), makes the rest of the page inert, keeps focus inside and
 * handles Escape. Clicking the backdrop area around the panel closes it.
 */
export function DialogShell({ onClose, layoutClassName, children, labelledBy, describedBy, label }: DialogShellProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const onCancel = (event: Event) => {
      // Let React state decide whether the dialog unmounts.
      event.preventDefault();
      close();
    };
    dialog.addEventListener('cancel', onCancel);
    if (dialogStack.getState().length === 0) document.documentElement.style.overflow = 'hidden';
    dialogStack.dispatch({ open: dialog });
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      dialogStack.dispatch({ close: dialog });
      if (dialogStack.getState().length === 0) document.documentElement.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={label}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-base-100 backdrop:bg-base-950/75 backdrop:backdrop-blur-sm"
    >
      {/* Keyboard users close with Escape (native); this click target is the mouse equivalent. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className={cx('flex h-full w-full', layoutClassName)} onClick={(e) => e.target === e.currentTarget && onClose()}>
        {children}
      </div>
    </dialog>
  );
}
