import { ChevronDown, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useGameVersions } from '../../hooks/useRemoteData';
import { packController } from '../../state/controller';
import { packStore } from '../../state/packStore';
import { useStore } from '../../state/store';
import { LOADERS, type Loader, type Profile } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Segmented, cx } from '../ui/primitives';

export function ProfileBar() {
  const profile = useStore(packStore, (s) => s.profile);
  const modCount = useStore(packStore, (s) => s.order.length);
  const { versions, fromFallback } = useGameVersions();
  const [pending, setPending] = useState<Profile | null>(null);

  const options = versions.includes(profile.gameVersion) ? versions : [profile.gameVersion, ...versions];

  function request(next: Profile) {
    if (next.gameVersion === profile.gameVersion && next.loader === profile.loader) return;
    if (modCount === 0) {
      void packController.changeProfile(next, 'revalidate');
    } else {
      setPending(next);
    }
  }

  function confirm(mode: 'revalidate' | 'clear') {
    if (!pending) return;
    void packController.changeProfile(pending, mode);
    setPending(null);
  }

  return (
    <section aria-label="Global profile" className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="space-y-1.5">
          <label htmlFor="game-version" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Minecraft version
          </label>
          <div className="relative">
            <select
              id="game-version"
              value={profile.gameVersion}
              onChange={(e) => request({ ...profile, gameVersion: e.target.value })}
              className="h-10 w-full appearance-none rounded-lg bg-slate-900 pl-3 pr-9 text-sm font-semibold text-white ring-1 ring-inset ring-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 md:w-44"
            >
              {options.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          </div>
        </div>

        <div className="space-y-1.5">
          <span id="loader-label" className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Mod loader
          </span>
          <Segmented<Loader>
            label="Mod loader"
            value={profile.loader}
            onChange={(loader) => request({ ...profile, loader })}
            options={LOADERS.map((l) => ({ value: l.id, label: l.label, activeClass: 'bg-emerald-500 text-slate-950 shadow' }))}
            className="w-full md:w-auto"
          />
        </div>

        <p className={cx('text-xs text-slate-500 md:ml-auto md:max-w-xs md:text-right')}>
          Every mod file is resolved for this exact version and loader.
          {fromFallback && ' (Using the built-in version list – Modrinth version tags are unavailable.)'}
        </p>
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        icon={<TriangleAlert className="size-6 text-amber-400" />}
        title="Change the pack profile?"
        description={
          pending && (
            <>
              Switching from <strong className="text-slate-200">{LOADERS.find((l) => l.id === profile.loader)?.label} {profile.gameVersion}</strong> to{' '}
              <strong className="text-slate-200">{LOADERS.find((l) => l.id === pending.loader)?.label} {pending.gameVersion}</strong>. Mod files are built
              for one specific version and loader, so the {modCount} mod{modCount === 1 ? '' : 's'} in your pack must be re-checked.
            </>
          )
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => confirm('clear')}>
              Clear pack
            </Button>
            <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => confirm('revalidate')}>
              Re-validate mods
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-slate-300">
          <li>
            <strong className="text-white">Re-validate</strong> keeps the mods you picked, fetches their newest compatible files and
            rebuilds dependencies. Mods with no build for the new profile are flagged.
          </li>
          <li>
            <strong className="text-white">Clear</strong> starts over with an empty pack.
          </li>
        </ul>
      </Modal>
    </section>
  );
}
