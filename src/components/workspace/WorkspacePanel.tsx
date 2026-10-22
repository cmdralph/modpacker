import {
  ArrowLeftRight,
  Ban,
  Boxes,
  CircleAlert,
  ClipboardCopy,
  FileUp,
  GitMerge,
  Link2,
  Monitor,
  Pin,
  RefreshCw,
  Search,
  Sparkles,
  Server,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { formatBytes, pluralize } from '../../lib/format';
import { packController } from '../../state/controller';
import { findConflicts, findDuplicates, orderedMods } from '../../state/pack';
import { packStore } from '../../state/packStore';
import { preferencesStore } from '../../state/preferences';
import { useStore } from '../../state/store';
import { ui } from '../../state/ui';
import type { PackMod } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Callout, Chip, IconButton, ModIcon, SOURCE_LABEL, Segmented, SourceBadge, Spinner, cx, inputClass, panelClass } from '../ui/primitives';
import { toast } from '../ui/Toasts';

type View = 'all' | 'mine' | 'deps' | 'problems';
type Sort = 'added' | 'name' | 'size';

function modSize(mod: PackMod): number {
  return (mod.source === 'modrinth' ? mod.modrinth?.size : mod.curseforge?.size) ?? mod.modrinth?.size ?? 0;
}

function removeWithUndo(mod: PackMod) {
  const undo = packController.removeMods([mod.key]);
  toast('info', `Removed ${mod.title}${mod.explicit ? ' and its unused dependencies' : ''}.`, { action: { label: 'Undo', onClick: undo } });
}

const PackModRow = memo(function PackModRow({ mod, parents, compact }: { mod: PackMod; parents: string[]; compact: boolean }) {
  const crossAvailable = mod.source === 'modrinth' ? Boolean(mod.curseforge) : Boolean(mod.modrinth);
  const other = mod.source === 'modrinth' ? 'curseforge' : 'modrinth';
  const env = mod.modrinth?.env;
  const clientOnly = env?.server === 'unsupported';
  const serverOnly = env?.client === 'unsupported';

  return (
    <li
      className={cx(
        'group flex items-start gap-3 rounded-xl ring-1 ring-inset transition-colors animate-fade-in',
        compact ? 'p-2' : 'p-3',
        (mod.status === 'ready' || mod.status === 'resolving') && 'bg-base-900 ring-base-800 hover:ring-base-700',
        mod.status === 'incompatible' && 'bg-amber-500/5 ring-amber-500/30',
        mod.status === 'error' && 'bg-rose-500/5 ring-rose-500/30',
      )}
    >
      <ModIcon src={mod.iconUrl} title={mod.title} size={compact ? 'xs' : 'sm'} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => ui.openDetails(mod)}
            className="min-w-0 truncate rounded text-left text-sm font-semibold text-base-50 hover:text-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            title="Show details and versions"
          >
            {mod.title}
          </button>
          <SourceBadge source={mod.source} compact className="hidden sm:inline-flex" />
        </div>

        {mod.status === 'resolving' && (
          <p className="flex items-center gap-1.5 text-xs text-base-400">
            <Spinner className="size-3" /> Finding the latest compatible file…
          </p>
        )}
        {mod.status === 'ready' && (
          <p className="truncate text-xs text-base-400" title={mod.versionLabel ?? undefined}>
            {mod.versionLabel} · {formatBytes(modSize(mod))}
          </p>
        )}
        {(mod.status === 'incompatible' || mod.status === 'error') && (
          <p className={cx('flex items-start gap-1.5 text-xs', mod.status === 'error' ? 'text-rose-300' : 'text-amber-200')}>
            {mod.status === 'error' ? <CircleAlert className="mt-px size-3 shrink-0" /> : <Ban className="mt-px size-3 shrink-0" />}
            <span className="[overflow-wrap:anywhere]">{mod.error}</span>
          </p>
        )}

        {!compact && (
          <div className="flex flex-wrap gap-1.5">
            {!mod.explicit && parents.length > 0 && (
              <Chip tone="info" icon={<GitMerge className="size-3" aria-hidden />} title={`Required by ${parents.join(', ')}`}>
                Dependency of {parents[0]}
                {parents.length > 1 && ` +${parents.length - 1}`}
              </Chip>
            )}
            {mod.status === 'ready' && mod.pinnedFileId && (
              <Chip tone="accent" icon={<Pin className="size-3" aria-hidden />} title="This exact version is kept even when newer ones exist">
                Pinned
              </Chip>
            )}
            {mod.status === 'ready' && clientOnly && (
              <Chip icon={<Monitor className="size-3" aria-hidden />} title="Not needed on servers">
                Client-only
              </Chip>
            )}
            {mod.status === 'ready' && serverOnly && (
              <Chip icon={<Server className="size-3" aria-hidden />} title="Not needed on clients">
                Server-only
              </Chip>
            )}
            {mod.status === 'ready' && crossAvailable && (
              <Chip icon={<Link2 className="size-3" aria-hidden />} title={`The identical file is also hosted on ${SOURCE_LABEL[other]}`}>
                Also on {SOURCE_LABEL[other]}
              </Chip>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-60 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {(mod.status === 'error' || mod.status === 'incompatible') && (
          <IconButton label={`Retry ${mod.title}`} onClick={() => void packController.retry(mod.key)}>
            <RefreshCw className="size-4" />
          </IconButton>
        )}
        <IconButton label={`Versions and details for ${mod.title}`} onClick={() => ui.openDetails(mod)}>
          <SlidersHorizontal className="size-4" />
        </IconButton>
        <IconButton label={`Remove ${mod.title}`} tone="danger" onClick={() => removeWithUndo(mod)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  );
});

function toMarkdown(mods: PackMod[], name: string, profile: string): string {
  const lines = mods.map((m) => `- [${m.title}](${m.pageUrl})${m.versionLabel ? ` — ${m.versionLabel}` : ''}${m.explicit ? '' : ' _(dependency)_'}`);
  return `## ${name}\n${profile} · ${pluralize(mods.length, 'mod')}\n\n${lines.join('\n')}\n`;
}

export function WorkspacePanel({ className }: { className?: string }) {
  const state = useStore(packStore, (s) => s);
  const compact = useStore(preferencesStore, (s) => s.density === 'compact');
  const [confirmClear, setConfirmClear] = useState(false);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<View>('all');
  const [sort, setSort] = useState<Sort>('added');
  const [checking, setChecking] = useState(false);

  const mods = useMemo(() => orderedMods(state), [state]);
  const conflicts = useMemo(() => findConflicts(state), [state]);
  const duplicates = useMemo(() => findDuplicates(state), [state]);

  const ready = mods.filter((m) => m.status === 'ready');
  const resolving = mods.filter((m) => m.status === 'resolving').length;
  const problems = mods.filter((m) => m.status === 'incompatible' || m.status === 'error');
  const dependencies = mods.filter((m) => !m.explicit);
  const totalSize = ready.reduce((sum, m) => sum + modSize(m), 0);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = mods.filter((m) => {
      if (view === 'mine' && !m.explicit) return false;
      if (view === 'deps' && m.explicit) return false;
      if (view === 'problems' && m.status !== 'incompatible' && m.status !== 'error') return false;
      return !needle || m.title.toLowerCase().includes(needle) || m.author.toLowerCase().includes(needle);
    });
    if (sort === 'name') return [...list].toSorted((a, b) => a.title.localeCompare(b.title));
    if (sort === 'size') return [...list].toSorted((a, b) => modSize(b) - modSize(a));
    return list;
  }, [mods, filter, view, sort]);

  async function checkForUpdates() {
    setChecking(true);
    try {
      const { updated, failed } = await packController.refreshAll();
      if (updated.length === 0 && failed.length === 0) toast('success', 'Everything’s already up to date ✨');
      else {
        const list = updated.slice(0, 3).map((u) => `${u.title} → ${u.to}`).join(', ');
        toast(
          failed.length > 0 ? 'warning' : 'success',
          (updated.length > 0 ? `Updated ${pluralize(updated.length, 'mod')}: ${list}${updated.length > 3 ? '…' : ''}.` : 'No newer versions found.') +
            (failed.length > 0 ? ` ${failed.length} couldn’t be checked.` : ''),
          { durationMs: 9000 },
        );
      }
    } finally {
      setChecking(false);
    }
  }

  async function copyList() {
    const text = toMarkdown(mods, state.meta.name, `${state.profile.loader} ${state.profile.gameVersion}`);
    try {
      await navigator.clipboard.writeText(text);
      toast('success', 'Mod list copied as Markdown.');
    } catch {
      toast('error', 'Your browser blocked clipboard access.');
    }
  }

  return (
    <section aria-label="Pack workspace" className={cx(panelClass, 'flex flex-col gap-3 p-4', className)}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-base-50">
            <Boxes className="size-5 text-accent-400" aria-hidden /> Your Pack
          </h2>
          <p className="text-xs text-base-400">
            {pluralize(mods.length, 'mod')}
            {dependencies.length > 0 && ` · ${pluralize(dependencies.length, 'dependency', 'dependencies')}`}
            {ready.length > 0 && ` · ${formatBytes(totalSize)}`}
            {resolving > 0 && ` · resolving ${resolving}`}
          </p>
        </div>
        <div className="flex items-center">
          <IconButton label="Import a .mrpack or CurseForge .zip" onClick={ui.openImport}>
            <FileUp className="size-4" />
          </IconButton>
          {mods.length > 0 && (
            <>
              <IconButton label="Check for newer versions (pinned mods stay put)" onClick={() => void checkForUpdates()} disabled={checking || resolving > 0}>
                {checking ? <Spinner /> : <Sparkles className="size-4" />}
              </IconButton>
              <IconButton label="Copy mod list as Markdown" onClick={() => void copyList()}>
                <ClipboardCopy className="size-4" />
              </IconButton>
              <IconButton label="Clear pack" tone="danger" onClick={() => setConfirmClear(true)}>
                <Trash2 className="size-4" />
              </IconButton>
            </>
          )}
        </div>
      </header>

      {problems.length > 0 && (
        <Callout
          tone="warning"
          icon={<TriangleAlert className="size-4" />}
          action={
            view !== 'problems' && (
              <Button size="xs" onClick={() => setView('problems')}>
                Show
              </Button>
            )
          }
        >
          {pluralize(problems.length, 'mod')} {problems.length === 1 ? 'has' : 'have'} no usable file for this profile and will be skipped on export.
        </Callout>
      )}
      {conflicts.map(({ mod, other }) => (
        <Callout key={`${mod.key}>${other.key}`} tone="error" icon={<Ban className="size-4" />} title="Incompatible mods">
          {mod.title} declares itself incompatible with {other.title}. Remove one of them.
        </Callout>
      ))}
      {duplicates.map(([a, b]) => (
        <Callout
          key={`${a.key}=${b.key}`}
          tone="warning"
          icon={<ArrowLeftRight className="size-4" />}
          title="Same mod added twice"
          action={
            <Button size="xs" onClick={() => removeWithUndo(b)}>
              Remove one
            </Button>
          }
        >
          {a.title} ({SOURCE_LABEL[a.source]}) and {b.title} ({SOURCE_LABEL[b.source]}) are the identical file.
        </Callout>
      ))}

      {mods.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-base-800 px-4 py-10 text-center">
          <Boxes className="size-9 text-base-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-base-300">Nothing here yet – let’s fix that!</p>
            <p className="mt-1 text-xs text-base-500">Search for mods and hit “Add”. Anything they need comes along automatically.</p>
          </div>
          <Button size="sm" icon={<FileUp className="size-3.5" />} onClick={ui.openImport}>
            Import an existing pack
          </Button>
        </div>
      ) : (
        <>
          {mods.length > 5 && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-base-500" aria-hidden />
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter your pack…"
                  aria-label="Filter pack"
                  className={cx(inputClass, 'h-9 pl-9')}
                />
              </div>
              <div className="flex items-center gap-2">
                <Segmented<View>
                  size="sm"
                  label="Show"
                  value={view}
                  onChange={setView}
                  className="flex-1"
                  options={[
                    { value: 'all', label: `All ${mods.length}` },
                    { value: 'mine', label: `Mine ${mods.length - dependencies.length}` },
                    { value: 'deps', label: `Deps ${dependencies.length}` },
                    ...(problems.length > 0 ? [{ value: 'problems' as const, label: `Issues ${problems.length}` }] : []),
                  ]}
                />
                <select
                  aria-label="Sort pack"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-8 rounded-lg bg-base-900 px-2 text-xs font-semibold text-base-200 ring-1 ring-inset ring-base-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
                >
                  <option value="added">Added</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
              </div>
            </div>
          )}
          <ul className={cx('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
            {shown.map((mod) => (
              <PackModRow key={mod.key} mod={mod} compact={compact} parents={mod.requiredBy.map((k) => state.mods[k]?.title ?? k)} />
            ))}
          </ul>
          {shown.length === 0 && <p className="py-4 text-center text-sm text-base-500">No mods match this filter.</p>}
        </>
      )}

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        icon={<Trash2 className="size-6 text-rose-400" />}
        title="Clear the pack?"
        description={`All ${pluralize(mods.length, 'mod')} will be removed from the workspace.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const undo = packController.removeMods(state.order);
                setConfirmClear(false);
                toast('info', 'Pack cleared.', { action: { label: 'Undo', onClick: undo } });
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
