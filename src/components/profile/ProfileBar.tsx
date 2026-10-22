import { Gamepad2, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useGameVersions } from '../../hooks/useRemoteData';
import { packController } from '../../state/controller';
import { packStore } from '../../state/packStore';
import { useStore } from '../../state/store';
import { LOADERS, loaderName, type Loader, type Profile } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Segmented, Select, cx, panelClass } from '../ui/primitives';

export function ProfileBar() {
  const profile = useStore(packStore, (s) => s.profile);
  const modCount = useStore(packStore, (s) => s.order.length);
  const { versions, fromFallback } = useGameVersions();
  const [pending, setPending] = useState<Profile | null>(null);

  const options = versions.includes(profile.gameVersion) ? versions : [profile.gameVersion, ...versions];
  const loader = LOADERS.find((l) => l.id === profile.loader)!;

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
    <section aria-label="Global profile" className={cx(panelClass, 'p-4')}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="space-y-1.5">
          <label htmlFor="game-version" className="block text-xs font-semibold uppercase tracking-wide text-base-400">
            Minecraft version
          </label>
          <Select
            id="game-version"
            value={profile.gameVersion}
            onChange={(e) => request({ ...profile, gameVersion: e.target.value })}
            icon={<Gamepad2 className="size-4" />}
            className="md:w-44"
          >
            {options.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-0 space-y-1.5">
          <span className="block text-xs font-semibold uppercase tracking-wide text-base-400">Mod loader</span>
          <Segmented<Loader>
            label="Mod loader"
            value={profile.loader}
            onChange={(next) => request({ ...profile, loader: next })}
            options={LOADERS.map((l) => ({ value: l.id, label: l.label, title: l.hint, activeClass: 'bg-accent-500 text-on-accent shadow' }))}
            className="w-full overflow-x-auto md:w-auto"
          />
        </div>

        <p className="text-xs text-base-500 md:ml-auto md:max-w-xs md:text-right">
          <span className="font-semibold text-base-300">{loader.label}:</span> {loader.hint}.
          {fromFallback && ' Using the built-in version list – Modrinth version tags are unavailable.'}
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
              Switching from <strong className="text-base-200">{loaderName(profile.loader)} {profile.gameVersion}</strong> to{' '}
              <strong className="text-base-200">{loaderName(pending.loader)} {pending.gameVersion}</strong>. Mod files are built for one specific version and
              loader, so the {modCount} mod{modCount === 1 ? '' : 's'} in your pack must be re-checked.
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
        <ul className="space-y-2 text-sm text-base-300">
          <li>
            <strong className="text-base-50">Re-validate</strong> keeps the mods you picked, fetches their newest compatible files and rebuilds dependencies.
            Pinned versions are released. Mods with no build for the new profile are flagged.
          </li>
          <li>
            <strong className="text-base-50">Clear</strong> starts over with an empty pack.
          </li>
        </ul>
      </Modal>
    </section>
  );
}
