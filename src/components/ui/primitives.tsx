import { LoaderCircle } from 'lucide-react';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { ModSource } from '../../types';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 ring-1 ring-inset ring-slate-700',
  ghost: 'text-slate-300 hover:bg-slate-800 hover:text-white',
  danger: 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 ring-1 ring-inset ring-rose-500/30',
  warning: 'bg-amber-400 text-slate-950 hover:bg-amber-300',
};

const SIZES: Record<ButtonSize, string> = {
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
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-50',
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

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx('animate-spin', className ?? 'size-4')} aria-hidden />;
}

export const SOURCE_LABEL: Record<ModSource, string> = { modrinth: 'Modrinth', curseforge: 'CurseForge' };

export function SourceBadge({ source, className }: { source: ModSource; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset',
        source === 'modrinth'
          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
          : 'bg-orange-500/10 text-orange-300 ring-orange-500/30',
        className,
      )}
    >
      <span className={cx('size-1.5 rounded-full', source === 'modrinth' ? 'bg-emerald-400' : 'bg-orange-400')} />
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function ModIcon({ src, title, size = 'md' }: { src: string | null; title: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dims = { sm: 'size-9 text-xs', md: 'size-12 text-sm', lg: 'size-14 text-base' }[size];
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  if (!src || failed) {
    return (
      <div
        className={cx(dims, 'flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 font-bold text-slate-300 ring-1 ring-slate-700')}
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
      className={cx(dims, 'shrink-0 rounded-xl bg-slate-800 object-cover ring-1 ring-slate-700')}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; activeClass?: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              active ? option.activeClass ?? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type CalloutTone = 'info' | 'warning' | 'error' | 'success';

const CALLOUT_TONES: Record<CalloutTone, string> = {
  info: 'bg-sky-500/10 text-sky-200 ring-sky-500/30',
  warning: 'bg-amber-500/10 text-amber-100 ring-amber-500/30',
  error: 'bg-rose-500/10 text-rose-200 ring-rose-500/30',
  success: 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30',
};

export function Callout({ tone, icon, title, children, action }: { tone: CalloutTone; icon?: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl p-3 text-sm ring-1 ring-inset', CALLOUT_TONES[tone])}>
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
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'h-10 w-full rounded-lg bg-slate-900 px-3 text-sm text-slate-100 ring-1 ring-inset ring-slate-700 placeholder:text-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60';
