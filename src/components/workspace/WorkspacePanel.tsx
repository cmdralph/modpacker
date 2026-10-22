import { ArrowLeftRight, Ban, Boxes, CircleAlert, ExternalLink, GitMerge, Link2, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { formatBytes, pluralize } from '../../lib/format';
import { packController } from '../../state/controller';
import { findConflicts, findDuplicates, orderedMods } from '../../state/pack';
import { packStore } from '../../state/packStore';
import { useStore } from '../../state/store';
import type { PackMod } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Callout, ModIcon, SOURCE_LABEL, SourceBadge, Spinner, cx } from '../ui/primitives';

function modSize(mod: PackMod): number {
  return (mod.source === 'modrinth' ? mod.modrinth?.size : mod.curseforge?.size) ?? 0;
}

const PackModRow = memo(function PackModRow({ mod, parents }: { mod: PackMod; parents: string[] }) {
  const crossAvailable = mod.source === 'modrinth' ? Boolean(mod.curseforge) : Boolean(mod.modrinth);
  const other = mod.source === 'modrinth' ? 'curseforge' : 'modrinth';

  return (
    <li
      className={cx(
        'flex items-start gap-3 rounded-xl p-3 ring-1 ring-inset',
        mod.status === 'ready' && 'bg-slate-900 ring-slate-800',
        mod.status === 'resolving' && 'bg-slate-900 ring-slate-800',
        mod.status === 'incompatible' && 'bg-amber-500/5 ring-amber-500/30',
        mod.status === 'error' && 'bg-rose-500/5 ring-rose-500/30',
      )}
    >
      <ModIcon src={mod.iconUrl} title={mod.title} size="sm" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <a href={mod.pageUrl} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-white hover:text-emerald-300">
            {mod.title}
          </a>
          <SourceBadge source={mod.source} className="hidden sm:inline-flex" />
        </div>

        {mod.status === 'resolving' && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Spinner className="size-3" /> Finding the latest compatible file…
          </p>
        )}
        {mod.status === 'ready' && (
          <p className="truncate text-xs text-slate-400" title={mod.versionLabel ?? undefined}>
            {mod.versionLabel} · {formatBytes(modSize(mod))}
          </p>
        )}
        {(mod.status === 'incompatible' || mod.status === 'error') && (
          <p className={cx('flex items-start gap-1.5 text-xs', mod.status === 'error' ? 'text-rose-300' : 'text-amber-200')}>
            {mod.status === 'error' ? <CircleAlert className="mt-px size-3 shrink-0" /> : <Ban className="mt-px size-3 shrink-0" />}
            <span>{mod.error}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {!mod.explicit && parents.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-300" title={`Required by ${parents.join(', ')}`}>
              <GitMerge className="size-3" aria-hidden /> Dependency of {parents[0]}
              {parents.length > 1 && ` +${parents.length - 1}`}
            </span>
          )}
          {mod.status === 'ready' && crossAvailable && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300" title={`The identical file is also hosted on ${SOURCE_LABEL[other]}`}>
              <Link2 className="size-3" aria-hidden /> Also on {SOURCE_LABEL[other]}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {(mod.status === 'error' || mod.status === 'incompatible') && (
          <button
            type="button"
            onClick={() => void packController.retry(mod.key)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label={`Retry ${mod.title}`}
            title="Retry"
          >
            <RefreshCw className="size-4" />
          </button>
        )}
        <a
          href={mod.pageUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white sm:block"
          aria-label={`Open ${mod.title} on ${SOURCE_LABEL[mod.source]}`}
          title={`Open on ${SOURCE_LABEL[mod.source]}`}
        >
          <ExternalLink className="size-4" />
        </a>
        <button
          type="button"
          onClick={() => packController.removeMods([mod.key])}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
          aria-label={`Remove ${mod.title}`}
          title={mod.explicit ? 'Remove (unused dependencies are removed too)' : 'Remove'}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
});

export function WorkspacePanel() {
  const state = useStore(packStore, (s) => s);
  const [confirmClear, setConfirmClear] = useState(false);

  const mods = useMemo(() => orderedMods(state), [state]);
  const conflicts = useMemo(() => findConflicts(state), [state]);
  const duplicates = useMemo(() => findDuplicates(state), [state]);

  const ready = mods.filter((m) => m.status === 'ready');
  const resolving = mods.filter((m) => m.status === 'resolving').length;
  const problems = mods.filter((m) => m.status === 'incompatible' || m.status === 'error').length;
  const dependencies = mods.filter((m) => !m.explicit).length;
  const totalSize = ready.reduce((sum, m) => sum + modSize(m), 0);

  return (
    <section id="workspace" aria-label="Pack workspace" className="flex flex-col gap-3 rounded-2xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Boxes className="size-5 text-emerald-400" aria-hidden /> Your Pack
          </h2>
          <p className="text-xs text-slate-400">
            {pluralize(mods.length, 'mod')}
            {dependencies > 0 && ` · ${pluralize(dependencies, 'dependency', 'dependencies')}`}
            {ready.length > 0 && ` · ${formatBytes(totalSize)}`}
            {resolving > 0 && ` · resolving ${resolving}`}
          </p>
        </div>
        {mods.length > 0 && (
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmClear(true)}>
            Clear
          </Button>
        )}
      </header>

      {problems > 0 && (
        <Callout tone="warning" icon={<TriangleAlert className="size-4" />}>
          {pluralize(problems, 'mod')} {problems === 1 ? 'has' : 'have'} no usable file for this profile and will be skipped on export.
        </Callout>
      )}
      {conflicts.map(({ mod, other }) => (
        <Callout key={`${mod.key}>${other.key}`} tone="error" icon={<Ban className="size-4" />} title="Incompatible mods">
          {mod.title} declares itself incompatible with {other.title}. Remove one of them.
        </Callout>
      ))}
      {duplicates.map(([a, b]) => (
        <Callout key={`${a.key}=${b.key}`} tone="warning" icon={<ArrowLeftRight className="size-4" />} title="Same mod added twice">
          {a.title} ({SOURCE_LABEL[a.source]}) and {b.title} ({SOURCE_LABEL[b.source]}) are the identical file. Remove one to avoid a duplicate jar.
        </Callout>
      ))}

      {mods.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-800 px-4 py-10 text-center">
          <Boxes className="size-9 text-slate-700" aria-hidden />
          <p className="text-sm font-semibold text-slate-300">Your pack is empty</p>
          <p className="text-xs text-slate-500">Search for mods and hit “Add to Pack”. Required dependencies are added automatically.</p>
        </div>
      ) : (
        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-30rem)] lg:min-h-48">
          {mods.map((mod) => (
            <PackModRow key={mod.key} mod={mod} parents={mod.requiredBy.map((k) => state.mods[k]?.title ?? k)} />
          ))}
        </ul>
      )}

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        icon={<Trash2 className="size-6 text-rose-400" />}
        title="Clear the pack?"
        description={`All ${pluralize(mods.length, 'mod')} will be removed from the workspace. This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                packController.clear();
                setConfirmClear(false);
              }}
            >
              Clear pack
            </Button>
          </>
        }
      />
    </section>
  );
}
