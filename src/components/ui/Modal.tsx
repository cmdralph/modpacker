import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from './primitives';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  /** `sheet` slides in from the right on large screens (bottom sheet on phones). */
  variant?: 'dialog' | 'sheet';
  /** Extra header content under the title (tabs, actions). */
  headerExtra?: ReactNode;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/** Accessible modal: Escape closes, focus moves inside, is trapped with Tab, and returns on close. */
export function Modal({ open, onClose, title, description, icon, children, footer, size = 'md', variant = 'dialog', headerExtra }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Capture-phase + immediate stop: only the top-most dialog closes (not the drawer behind it).
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  const sheet = variant === 'sheet';

  return (
    <div className={cx('fixed inset-0 z-50 flex', sheet ? 'items-end justify-end sm:items-stretch' : 'items-end justify-center sm:items-center sm:p-4')}>
      <div className="absolute inset-0 bg-base-950/75 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex w-full flex-col overflow-hidden bg-base-900 shadow-2xl ring-1 ring-base-700 focus:outline-none',
          sheet
            ? 'max-h-[94vh] rounded-t-2xl animate-slide-up sm:max-h-none sm:max-w-xl sm:rounded-none sm:rounded-l-2xl'
            : cx('max-h-[92vh] rounded-t-2xl animate-fade-in sm:rounded-2xl', SIZE[size]),
        )}
      >
        <div className="border-b border-base-800 p-5 pb-4">
          <div className="flex items-start gap-3">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-bold text-base-50">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1 text-sm text-base-400">
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-base-400 hover:bg-base-800 hover:text-base-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              aria-label="Close dialog"
            >
              <X className="size-5" />
            </button>
          </div>
          {headerExtra && <div className="mt-4">{headerExtra}</div>}
        </div>
        {children && <div className="flex-1 overflow-y-auto p-5">{children}</div>}
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-base-800 bg-base-900/80 p-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}
