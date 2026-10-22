import { ChevronDown, LoaderCircle } from 'lucide-react';
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { ModSource } from '../../types';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-base-950';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-on-accent hover:bg-accent-400 shadow-lg shadow-accent-500/20',
  secondary: 'bg-base-800 text-base-100 hover:bg-base-700 ring-1 ring-inset ring-base-700',
  ghost: 'text-base-300 hover:bg-base-800 hover:text-base-50',
  danger: 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 ring-1 ring-inset ring-rose-500/30',
  warning: 'bg-amber-400 text-ink hover:bg-amber-300',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors active:scale-[0.98]',
        focusRing,
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'default' | 'danger' | 'active';
}

/** Square icon-only button; `label` becomes both the accessible name and the tooltip. */
export function IconButton({ label, tone = 'default', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
        focusRing,
        'disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'danger' && 'text-base-400 hover:bg-rose-500/10 hover:text-rose-300',
        tone === 'active' && 'bg-accent-500/15 text-accent-300 ring-1 ring-inset ring-accent-500/30',
        tone === 'default' && 'text-base-400 hover:bg-base-800 hover:text-base-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('animate-spin', className ?? 'size-4')} aria-hidden />;
}

export const SOURCE_LABEL: Record<ModSource, string> = { modrinth: 'Modrinth', curseforge: 'CurseForge' };

/** Platform badge. Brand colours (Modrinth green, CurseForge orange) stay fixed regardless of the accent. */
export function SourceBadge({ source, className, compact }: { source: ModSource; className?: string; compact?: boolean }) {
  return (
    <span
      title={SOURCE_LABEL[source]}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset',
        source === 'modrinth'
          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
          : 'bg-orange-500/10 text-orange-300 ring-orange-500/30',
        className,
      )}
    >
      <span className={cx('size-1.5 rounded-full', source === 'modrinth' ? 'bg-emerald-400' : 'bg-orange-400')} />
      {compact ? (source === 'modrinth' ? 'MR' : 'CF') : SOURCE_LABEL[source]}
    </span>
  );
}

const ICON_SIZES = { xs: 'size-8 text-[10px]', sm: 'size-9 text-xs', md: 'size-12 text-sm', lg: 'size-14 text-base', xl: 'size-20 text-xl' };

export function ModIcon({ src, title, size = 'md' }: { src: string | null; title: string; size?: keyof typeof ICON_SIZES }) {
  const [failed, setFailed] = useState(false);
  const dims = ICON_SIZES[size];
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  if (!src || failed) {
    return (
      <div
        className={cx(dims, 'flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-base-700 to-base-800 font-bold text-base-300 ring-1 ring-base-700')}
        aria-hidden
      >
        {initials || '?'}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cx(dims, 'shrink-0 rounded-xl bg-base-800 object-cover ring-1 ring-base-700')}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; activeClass?: string; title?: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-lg bg-base-900 p-1 ring-1 ring-base-800', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-colors',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
              active ? option.activeClass ?? 'bg-base-700 text-base-50 shadow' : 'text-base-400 hover:text-base-200',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-base-100">
          {label}
        </label>
        {description && <p className="text-xs text-base-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          focusRing,
          checked ? 'bg-accent-500' : 'bg-base-700',
        )}
      >
        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }>(function Select(
  { className, children, icon, ...rest },
  ref,
) {
  return (
    <div className={cx('relative', className)}>
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-400">{icon}</span>}
      <select
        ref={ref}
        className={cx(
          'h-10 w-full appearance-none rounded-lg bg-base-900 pr-9 text-sm font-semibold text-base-50 ring-1 ring-inset ring-base-700',
          'focus:outline-none focus:ring-2 focus:ring-accent-400',
          icon ? 'pl-9' : 'pl-3',
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-base-400" aria-hidden />
    </div>
  );
});

export function Chip({ children, tone = 'neutral', title, icon }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'info' | 'warning' | 'danger'; title?: string; icon?: ReactNode }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-base-800 text-base-300',
        tone === 'accent' && 'bg-accent-500/10 text-accent-300',
        tone === 'info' && 'bg-sky-500/10 text-sky-300',
        tone === 'warning' && 'bg-amber-500/10 text-amber-300',
        tone === 'danger' && 'bg-rose-500/10 text-rose-300',
      )}
    >
      {icon}
      {children}
    </span>
  );
}

type CalloutTone = 'info' | 'warning' | 'error' | 'success';

const CALLOUT_TONES: Record<CalloutTone, string> = {
  info: 'bg-sky-500/10 text-sky-200 ring-sky-500/30',
  warning: 'bg-amber-500/10 text-amber-100 ring-amber-500/30',
  error: 'bg-rose-500/10 text-rose-200 ring-rose-500/30',
  success: 'bg-accent-500/10 text-accent-200 ring-accent-500/30',
};

export function Callout({ tone, icon, title, children, action }: { tone: CalloutTone; icon?: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl p-3 text-sm ring-1 ring-inset animate-fade-in', CALLOUT_TONES[tone])}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-base-400">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-base-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'h-10 w-full rounded-lg bg-base-900 px-3 text-sm text-base-100 ring-1 ring-inset ring-base-700 placeholder:text-base-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:opacity-60';

/** Card surface used by the main panels. */
export const panelClass = 'rounded-2xl bg-base-900/60 ring-1 ring-base-800 shadow-sm';
