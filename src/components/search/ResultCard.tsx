import { Ban, Check, Download, Info, Plus, RefreshCw, X } from 'lucide-react';
import { memo, useState } from 'react';
import { formatCount } from '../../lib/format';
import { packController } from '../../state/controller';
import type { Density, ResultView } from '../../state/preferences';
import { ui } from '../../state/ui';
import type { PackMod, SearchHit } from '../../types';
import { Button, ModIcon, SourceBadge, cx } from '../ui/primitives';
import { toast } from '../ui/Toasts';

interface ResultCardProps {
  hit: SearchHit;
  /** The pack entry covering this hit (directly or via a cross-platform match), if any. */
  packMod: PackMod | null;
  view: ResultView;
  density: Density;
  showDescription: boolean;
}

function AddButton({ hit, packMod }: { hit: SearchHit; packMod: PackMod | null }) {
  const [hover, setHover] = useState(false);

  if (!packMod) {
    return (
      <Button
        variant="primary"
        size="sm"
        icon={<Plus className="size-3.5" />}
        onClick={() => void packController.addMod(hit, { explicit: true })}
      >
        Add
      </Button>
    );
  }

  switch (packMod.status) {
    case 'resolving':
      return (
        <Button size="sm" loading>
          Adding
        </Button>
      );
    case 'error':
      return (
        <Button
          size="sm"
          variant="danger"
          icon={<RefreshCw className="size-3.5" />}
          onClick={() => void packController.retry(packMod.key)}
        >
          Retry
        </Button>
      );
    default: {
      const incompatible = packMod.status === 'incompatible';
      const remove = () => {
        const undo = packController.removeMods([packMod.key]);
        toast('info', `Removed ${packMod.title}.`, { action: { label: 'Undo', onClick: undo } });
      };
      return (
        <Button
          size="sm"
          variant={hover ? 'danger' : incompatible ? 'danger' : 'secondary'}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onClick={remove}
          title={packMod.key === hit.key ? 'Remove from pack' : `In your pack via ${packMod.source === 'modrinth' ? 'Modrinth' : 'CurseForge'} – click to remove`}
          icon={hover ? <X className="size-3.5" /> : incompatible ? <Ban className="size-3.5" /> : <Check className="size-3.5 text-accent-400" />}
        >
          {hover ? 'Remove' : incompatible ? 'No file' : 'In pack'}
        </Button>
      );
    }
  }
}

export const ResultCard = memo(function ResultCard({ hit, packMod, view, density, showDescription }: ResultCardProps) {
  const compact = density === 'compact';
  const open = () => ui.openDetails(hit);
  // "Stretched" title button: its ::after overlay covers the whole card, so clicking anywhere
  // opens the details while keyboard and screen-reader users get one real, labelled button.
  const title = (className: string) => (
    <button
      type="button"
      onClick={open}
      title="Show details, versions and compatibility"
      className={cx(
        'min-w-0 max-w-full truncate rounded text-left font-bold text-base-50 hover:text-accent-300 focus-visible:outline-none',
        "after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent-400",
        className,
      )}
    >
      {hit.title}
    </button>
  );

  const downloads = (
    <span className="inline-flex items-center gap-1 text-xs text-base-500" title={`${hit.downloads.toLocaleString()} downloads`}>
      <Download className="size-3" aria-hidden />
      {formatCount(hit.downloads)}
    </span>
  );

  const shell = cx(
    'group relative min-w-0 cursor-pointer rounded-2xl bg-base-900 ring-1 transition-all',
    'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-base-950/40',
    packMod ? 'ring-accent-500/30' : 'ring-base-800 hover:ring-base-600',
  );

  if (view === 'list') {
    return (
      <article className={cx(shell, 'flex items-center gap-3', compact ? 'p-2' : 'p-3')}>
        <ModIcon src={hit.iconUrl} title={hit.title} size={compact ? 'xs' : 'sm'} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            {title('shrink')}
            <span className="hidden min-w-0 max-w-[40%] shrink-[2] truncate text-xs text-base-500 sm:inline">by {hit.author}</span>
          </div>
          {showDescription && !compact && <p className="truncate text-sm text-base-400">{hit.description}</p>}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {downloads}
          <SourceBadge source={hit.source} compact={compact} />
        </div>
        <div className="relative z-10">
          <AddButton hit={hit} packMod={packMod} />
        </div>
      </article>
    );
  }

  return (
    <article className={cx(shell, 'flex flex-col', compact ? 'gap-2 p-3' : 'gap-3 p-4')}>
      <div className="flex items-start gap-3">
        <ModIcon src={hit.iconUrl} title={hit.title} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          {title('block group-hover:text-accent-300')}
          <p className="truncate text-xs text-base-400">by {hit.author}</p>
        </div>
        <Info className="size-4 shrink-0 text-base-600 opacity-0 transition group-hover:opacity-100" aria-hidden />
      </div>

      {showDescription && (
        <p className={cx('text-sm text-base-300 [overflow-wrap:anywhere]', compact ? 'line-clamp-1' : 'line-clamp-2 min-h-[2.5rem]')}>{hit.description || 'No description provided.'}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SourceBadge source={hit.source} compact={compact} />
          {downloads}
        </div>
        <div className="relative z-10">
          <AddButton hit={hit} packMod={packMod} />
        </div>
      </div>
    </article>
  );
});

export function ResultSkeleton({ view }: { view: ResultView }) {
  if (view === 'list') {
    return (
      <div className="flex animate-pulse items-center gap-3 rounded-2xl bg-base-900 p-3 ring-1 ring-base-800" aria-hidden>
        <div className="size-9 rounded-xl bg-base-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 rounded bg-base-800" />
          <div className="h-3 w-2/3 rounded bg-base-800" />
        </div>
        <div className="h-8 w-20 rounded-lg bg-base-800" />
      </div>
    );
  }
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-2xl bg-base-900 p-4 ring-1 ring-base-800" aria-hidden>
      <div className="flex gap-3">
        <div className="size-12 rounded-xl bg-base-800" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 w-2/3 rounded bg-base-800" />
          <div className="h-3 w-1/3 rounded bg-base-800" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded bg-base-800" />
        <div className="h-3 w-5/6 rounded bg-base-800" />
      </div>
      <div className="flex justify-between pt-1">
        <div className="h-5 w-20 rounded-full bg-base-800" />
        <div className="h-8 w-24 rounded-lg bg-base-800" />
      </div>
    </div>
  );
}
