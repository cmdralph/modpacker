import { Ban, Check, Download, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { formatCount } from '../../lib/format';
import { packController } from '../../state/controller';
import type { PackModStatus, SearchHit } from '../../types';
import { Button, ModIcon, SourceBadge, cx } from '../ui/primitives';

interface ResultCardProps {
  hit: SearchHit;
  /** Status of this mod in the pack, or null when it isn't in the pack. */
  packStatus: PackModStatus | null;
}

function AddButton({ hit, packStatus }: ResultCardProps) {
  const add = () => void packController.addMod(hit, { explicit: true });

  switch (packStatus) {
    case null:
      return (
        <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={add}>
          Add to Pack
        </Button>
      );
    case 'resolving':
      return (
        <Button size="sm" loading>
          Resolving…
        </Button>
      );
    case 'ready':
      return (
        <Button size="sm" disabled icon={<Check className="size-3.5 text-emerald-400" />} className="!opacity-100">
          In Pack
        </Button>
      );
    case 'incompatible':
      return (
        <Button size="sm" variant="danger" disabled icon={<Ban className="size-3.5" />} className="!opacity-100">
          No compatible file
        </Button>
      );
    case 'error':
      return (
        <Button size="sm" variant="danger" icon={<RefreshCw className="size-3.5" />} onClick={() => void packController.retry(hit.key)}>
          Retry
        </Button>
      );
  }
}

export const ResultCard = memo(function ResultCard({ hit, packStatus }: ResultCardProps) {
  return (
    <article
      className={cx(
        'group flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 ring-1 transition',
        packStatus ? 'ring-emerald-500/30' : 'ring-slate-800 hover:ring-slate-600',
      )}
    >
      <div className="flex items-start gap-3">
        <ModIcon src={hit.iconUrl} title={hit.title} />
        <div className="min-w-0 flex-1">
          <a
            href={hit.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="group/link inline-flex max-w-full items-center gap-1 font-bold text-white hover:text-emerald-300"
          >
            <span className="truncate">{hit.title}</span>
            <ExternalLink className="size-3 shrink-0 opacity-0 transition group-hover/link:opacity-100" aria-hidden />
          </a>
          <p className="truncate text-xs text-slate-400">by {hit.author}</p>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-sm text-slate-300">{hit.description || 'No description provided.'}</p>

      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SourceBadge source={hit.source} />
          <span className="inline-flex items-center gap-1 text-xs text-slate-500" title={`${hit.downloads.toLocaleString()} downloads`}>
            <Download className="size-3" aria-hidden />
            {formatCount(hit.downloads)}
          </span>
        </div>
        <AddButton hit={hit} packStatus={packStatus} />
      </div>
    </article>
  );
});

export function ResultSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800" aria-hidden>
      <div className="flex gap-3">
        <div className="size-12 rounded-xl bg-slate-800" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 w-2/3 rounded bg-slate-800" />
          <div className="h-3 w-1/3 rounded bg-slate-800" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded bg-slate-800" />
        <div className="h-3 w-5/6 rounded bg-slate-800" />
      </div>
      <div className="flex justify-between pt-1">
        <div className="h-5 w-20 rounded-full bg-slate-800" />
        <div className="h-8 w-28 rounded-lg bg-slate-800" />
      </div>
    </div>
  );
}
