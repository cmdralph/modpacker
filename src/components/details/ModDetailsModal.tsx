import {
  Ban,
  Calendar,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  Heart,
  Monitor,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Scale,
  Server,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProjectInfo } from '../../api/common';
import { modKey } from '../../api/common';
import { errorMessage, isAbortError } from '../../api/http';
import { getProjectDetails, listVersionOptions, releaseVersions } from '../../api/projects';
import { formatBytes, formatCount, formatDate } from '../../lib/format';
import { packController } from '../../state/controller';
import { orderedMods, packCoverage } from '../../state/pack';
import { packStore } from '../../state/packStore';
import { useStore } from '../../state/store';
import { ui, uiStore } from '../../state/ui';
import { compatibleLoaders, loaderName, type Loader, type PackMod, type ProjectDetails, type SideSupport, type VersionOption } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Callout, Chip, ModIcon, Segmented, SourceBadge, Spinner, cx } from '../ui/primitives';
import { toast } from '../ui/Toasts';

type Load<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T };
type ChannelFilter = 'all' | 'release';

const VISIBLE_GAME_VERSIONS = 14;

function SideBadge({ label, support, icon }: { label: string; support: SideSupport; icon: ReactNode }) {
  const text = { required: 'Required', optional: 'Optional', unsupported: 'Not needed', unknown: 'Unknown' }[support];
  return (
    <div className="flex items-center gap-2 rounded-lg bg-base-800/60 px-3 py-2">
      <span className="text-base-400">{icon}</span>
      <div className="leading-tight">
        <p className="text-[11px] uppercase tracking-wide text-base-500">{label}</p>
        <p className={cx('text-sm font-semibold', support === 'unsupported' ? 'text-base-400' : 'text-base-100')}>{text}</p>
      </div>
    </div>
  );
}

function CompatibilityMatrix({ details, gameVersion, loader }: { details: ProjectDetails; gameVersion: string; loader: Loader }) {
  const [expanded, setExpanded] = useState(false);
  const versions = releaseVersions(details.gameVersions);
  const shown = expanded ? versions : versions.slice(0, VISIBLE_GAME_VERSIONS);
  const accepted = compatibleLoaders(loader);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-base-400">Compatibility</h3>
      <div className="flex flex-wrap gap-1.5">
        {details.loaders.length === 0 && <span className="text-sm text-base-500">No loader information.</span>}
        {details.loaders.map((l) => (
          <Chip key={l} tone={accepted.includes(l as Loader) ? 'accent' : 'neutral'} icon={accepted.includes(l as Loader) ? <Check className="size-3" /> : undefined}>
            {loaderName(l as Loader)}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((v) => (
          <Chip key={v} tone={v === gameVersion ? 'accent' : 'neutral'}>
            {v}
          </Chip>
        ))}
        {versions.length > VISIBLE_GAME_VERSIONS && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent-300 hover:bg-accent-500/10">
            {expanded ? 'Show less' : `+${versions.length - VISIBLE_GAME_VERSIONS} more`}
          </button>
        )}
      </div>
    </section>
  );
}

function VersionRow({
  option,
  state,
  onUse,
  busy,
}: {
  option: VersionOption;
  state: 'current' | 'pinned' | 'available';
  onUse: () => void;
  busy: boolean;
}) {
  return (
    <li className={cx('flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-inset', state === 'available' ? 'ring-base-800 hover:bg-base-800/40' : 'bg-accent-500/5 ring-accent-500/30')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-base-100" title={option.name}>
            {option.name}
          </span>
          {option.channel !== 'release' && <Chip tone={option.channel === 'beta' ? 'warning' : 'danger'}>{option.channel}</Chip>}
        </div>
        <p className="truncate text-xs text-base-500">
          {formatDate(option.published)} · {formatBytes(option.size)} · {option.loaders.map((l) => loaderName(l as Loader)).join(', ')}
        </p>
      </div>
      {state === 'available' ? (
        <Button size="xs" onClick={onUse} disabled={busy}>
          Use this
        </Button>
      ) : (
        <Chip tone="accent" icon={state === 'pinned' ? <Pin className="size-3" /> : <Check className="size-3" />}>
          {state === 'pinned' ? 'Pinned' : 'In pack'}
        </Chip>
      )}
    </li>
  );
}

export function ModDetailsModal() {
  const target = useStore(uiStore, (s) => s.details);
  const profile = useStore(packStore, (s) => s.profile);
  const [attempt, setAttempt] = useState(0);
  if (!target) return null;
  // Remounting per project/profile/attempt gives every load a clean "loading" state.
  const key = `${modKey(target.source, target.projectId)}|${profile.loader}|${profile.gameVersion}|${attempt}`;
  return <ModDetails key={key} target={target} onRetry={() => setAttempt((n) => n + 1)} />;
}

async function load<T>(promise: Promise<T>, set: (value: Load<T>) => void) {
  try {
    set({ status: 'ready', data: await promise });
  } catch (error) {
    if (!isAbortError(error)) set({ status: 'error', error: errorMessage(error) });
  }
}

function ModDetails({ target, onRetry }: { target: ProjectInfo; onRetry: () => void }) {
  const pack = useStore(packStore, (s) => s);
  const { profile } = pack;
  const [details, setDetails] = useState<Load<ProjectDetails>>({ status: 'loading' });
  const [versions, setVersions] = useState<Load<VersionOption[]>>({ status: 'loading' });
  const [channel, setChannel] = useState<ChannelFilter>('all');

  const key = modKey(target.source, target.projectId);
  const coverage = useMemo(() => packCoverage(pack), [pack]);
  const packMod = coverage.get(key) ?? null;
  const nativeInPack = packMod?.key === key ? packMod : null;
  const requires = nativeInPack ? orderedMods(pack).filter((m) => m.requiredBy.includes(nativeInPack.key)) : [];
  const requiredBy = nativeInPack ? nativeInPack.requiredBy.map((k) => pack.mods[k]).filter((m): m is PackMod => Boolean(m)) : [];

  // Fetch once per mount; the parent remounts this component when the project or profile changes.
  const source = target.source;
  const projectId = target.projectId;
  const [initialProfile] = useState(profile);
  useEffect(() => {
    const controller = new AbortController();
    void load(getProjectDetails(source, projectId, controller.signal), setDetails);
    void load(listVersionOptions(source, projectId, initialProfile, controller.signal), setVersions);
    return () => controller.abort();
  }, [source, projectId, initialProfile]);

  const info = details.status === 'ready' ? details.data : null;
  const currentFileId = nativeInPack
    ? nativeInPack.source === 'modrinth'
      ? nativeInPack.modrinth?.versionId
      : nativeInPack.curseforge
        ? String(nativeInPack.curseforge.fileId)
        : undefined
    : undefined;
  const pinned = nativeInPack?.pinnedFileId ?? null;
  const busy = nativeInPack?.status === 'resolving';
  const versionList = versions.status === 'ready' ? versions.data.filter((v) => channel === 'all' || v.channel === 'release') : [];

  async function pinVersion(option: VersionOption) {
    if (nativeInPack) {
      await packController.setVersion(nativeInPack.key, option.id);
      toast('success', `Done – ${target.title} is pinned to ${option.name}.`);
    } else {
      void packController.addMod(target, { explicit: true, pinnedFileId: option.id });
      toast('success', `Added ${target.title} (${option.name}).`);
    }
  }

  function remove() {
    if (!packMod) return;
    const undo = packController.removeMods([packMod.key]);
    toast('info', `Removed ${packMod.title}.`, { action: { label: 'Undo', onClick: undo } });
  }

  return (
    <Modal
      open
      variant="sheet"
      onClose={ui.closeDetails}
      title={
        <span className="flex items-center gap-3">
          <ModIcon src={info?.iconUrl ?? target.iconUrl} title={target.title} size="lg" />
          <span className="min-w-0">
            <span className="block truncate">{info?.title ?? target.title}</span>
            <span className="mt-0.5 flex items-center gap-2 text-sm font-normal text-base-400">
              by {info?.author ?? target.author} <SourceBadge source={target.source} />
            </span>
          </span>
        </span>
      }
      footer={
        <>
          {packMod && (
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Remove from pack
            </Button>
          )}
          {nativeInPack && pinned && (
            <Button icon={<PinOff className="size-4" />} onClick={() => void packController.setVersion(nativeInPack.key, null)} disabled={busy}>
              Always use latest
            </Button>
          )}
          {!packMod && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => void packController.addMod(target, { explicit: true })}>
              Add latest to pack
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-base-300">{info?.description ?? target.description}</p>

        {(requires.length > 0 || requiredBy.length > 0) && (
          <div className="space-y-1.5 text-sm">
            {requiredBy.length > 0 && (
              <p className="text-base-400">
                <span className="font-semibold text-base-200">Needed by</span> {requiredBy.map((m) => m.title).join(', ')}
              </p>
            )}
            {requires.length > 0 && (
              <p className="text-base-400">
                <span className="font-semibold text-base-200">Pulls in</span> {requires.map((m) => m.title).join(', ')}
              </p>
            )}
          </div>
        )}

        {packMod && packMod.key !== key && (
          <Callout tone="info" icon={<Check className="size-4" />}>
            Already in your pack via {packMod.source === 'modrinth' ? 'Modrinth' : 'CurseForge'} – the identical file is used.
          </Callout>
        )}

        {details.status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-base-400">
            <Spinner /> Loading project details…
          </div>
        )}
        {details.status === 'error' && (
          <Callout
            tone="error"
            icon={<CircleAlert className="size-4" />}
            title="Couldn’t load details"
            action={<Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>Retry</Button>}
          >
            {details.error}
          </Callout>
        )}

        {info && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon={<Download className="size-4" />} label="Downloads" value={formatCount(info.downloads)} />
              {info.followers !== null && <Stat icon={<Heart className="size-4" />} label={target.source === 'modrinth' ? 'Followers' : 'Likes'} value={formatCount(info.followers)} />}
              {info.updated && <Stat icon={<Calendar className="size-4" />} label="Updated" value={formatDate(info.updated)} />}
              {info.license && <Stat icon={<Scale className="size-4" />} label="License" value={info.license} />}
            </div>

            {info.side && (
              <div className="grid grid-cols-2 gap-2">
                <SideBadge label="Client" support={info.side.client} icon={<Monitor className="size-4" />} />
                <SideBadge label="Server" support={info.side.server} icon={<Server className="size-4" />} />
              </div>
            )}

            <CompatibilityMatrix details={info} gameVersion={profile.gameVersion} loader={profile.loader} />

            {info.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {info.categories.map((c) => (
                  <Chip key={c}>{c.replace(/-/g, ' ')}</Chip>
                ))}
              </div>
            )}

            {info.gallery.length > 0 && (
              <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                {info.gallery.map((g) => (
                  <a key={g.url} href={g.url} target="_blank" rel="noreferrer" className="shrink-0 snap-start">
                    <img src={g.url} alt={g.title ?? ''} loading="lazy" className="h-28 w-48 rounded-lg object-cover ring-1 ring-base-800" />
                  </a>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {info.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-base-800 px-2.5 py-1 text-xs font-semibold text-base-200 hover:bg-base-700"
                >
                  {l.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              ))}
            </div>
          </>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-base-400">
              Files for {loaderName(profile.loader)} {profile.gameVersion}
            </h3>
            <Segmented<ChannelFilter>
              size="sm"
              label="Release channel"
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'all', label: 'All' },
                { value: 'release', label: 'Releases' },
              ]}
            />
          </div>
          {versions.status === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-base-400">
              <Spinner /> Finding compatible files…
            </div>
          )}
          {versions.status === 'error' && <Callout tone="error" icon={<CircleAlert className="size-4" />}>{versions.error}</Callout>}
          {versions.status === 'ready' && versionList.length === 0 && (
            <Callout tone="warning" icon={<Ban className="size-4" />} title="No compatible files">
              This project has no {channel === 'release' ? 'stable ' : ''}build for {loaderName(profile.loader)} {profile.gameVersion}. Check the compatibility list
              above for versions and loaders it does support.
            </Callout>
          )}
          {versionList.length > 0 && (
            <ul className="space-y-1.5">
              {versionList.slice(0, 30).map((option) => (
                <VersionRow
                  key={option.id}
                  option={option}
                  busy={busy}
                  state={option.id === currentFileId ? (pinned === option.id ? 'pinned' : 'current') : 'available'}
                  onUse={() => void pinVersion(option)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-base-800/60 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-base-500">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-base-100" title={value}>
        {value}
      </p>
    </div>
  );
}
