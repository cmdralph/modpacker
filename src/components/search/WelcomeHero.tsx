import { FileUp, X } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/http';
import { STARTER_KITS, type StarterKit } from '../../data/starterKits';
import { pluralize } from '../../lib/format';
import { packController } from '../../state/controller';
import { packStore } from '../../state/packStore';
import { setPreferences } from '../../state/preferences';
import { useStore } from '../../state/store';
import { ui } from '../../state/ui';
import { loaderName } from '../../types';
import { Button, IconButton, cx, panelClass } from '../ui/primitives';
import { toast } from '../ui/Toasts';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late crafting?';
  if (hour < 12) return 'Good morning!';
  if (hour < 18) return 'Good afternoon!';
  return 'Good evening!';
}

async function applyKit(kit: StarterKit) {
  try {
    const result = await packController.addKit(kit.slugs);
    const parts = [`Added ${pluralize(result.added.length, 'mod')} from ${kit.title}`];
    if (result.unavailable.length > 0) parts.push(`${result.unavailable.length} skipped (no build for this version yet)`);
    toast(result.added.length > 0 ? 'success' : 'warning', `${parts.join(' · ')}.`);
  } catch (error) {
    toast('error', `Couldn’t add the ${kit.title} kit: ${errorMessage(error)}`);
  }
}

/** Friendly first-run guide with one-click starter kits. Shown while the pack is empty. */
export function WelcomeHero() {
  const profile = useStore(packStore, (s) => s.profile);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <section aria-label="Getting started" className={cx(panelClass, 'relative overflow-hidden p-5 sm:p-6 animate-fade-in')}>
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent-500/10 blur-3xl" aria-hidden />
      <IconButton label="Hide the welcome guide" onClick={() => setPreferences({ welcomeDismissed: true })} className="absolute right-3 top-3">
        <X className="size-4" />
      </IconButton>

      <p className="text-sm font-semibold text-accent-300">{greeting()}</p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-base-50 sm:text-2xl">Let’s build your modpack 🧱</h2>
      <ol className="mt-3 grid gap-2 text-sm text-base-300 sm:grid-cols-3">
        <li>
          <span className="font-bold text-base-100">1.</span> Pick your Minecraft version and loader above.
        </li>
        <li>
          <span className="font-bold text-base-100">2.</span> Add mods – dependencies come along automatically.
        </li>
        <li>
          <span className="font-bold text-base-100">3.</span> Export a .mrpack or CurseForge .zip.
        </li>
      </ol>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-base-400">
        Or start with a kit for {loaderName(profile.loader)} {profile.gameVersion}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STARTER_KITS.map((kit) => (
          <button
            key={kit.id}
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(kit.id);
              await applyKit(kit);
              setBusy(null);
            }}
            className={cx(
              'group flex flex-col gap-1 rounded-xl bg-base-900 p-3 text-left ring-1 ring-base-800 transition-colors',
              'hover:ring-accent-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-wait disabled:opacity-60',
            )}
          >
            <span className="flex items-center gap-2 font-bold text-base-50">
              <span aria-hidden>{kit.emoji}</span> {kit.title}
              {busy === kit.id && <span className="ml-auto text-xs font-normal text-base-400">Adding…</span>}
            </span>
            <span className="text-xs text-base-400">{kit.blurb}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-base-400">
        Already have a pack?
        <Button size="xs" icon={<FileUp className="size-3.5" />} onClick={() => ui.openImport()}>
          Import it
        </Button>
      </div>
    </section>
  );
}
