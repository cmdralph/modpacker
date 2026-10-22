import { Boxes, ChevronDown, FileUp, Keyboard, Pickaxe, Settings, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ModDetailsModal } from './components/details/ModDetailsModal';
import { ExportPanel } from './components/export/ExportPanel';
import { ImportDialog } from './components/import/ImportDialog';
import { PacksDialog } from './components/library/PacksDialog';
import { ProfileBar } from './components/profile/ProfileBar';
import { SearchPanel } from './components/search/SearchPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { DialogShell } from './components/ui/DialogShell';
import { Toaster, toast } from './components/ui/Toasts';
import { Button, IconButton, cx } from './components/ui/primitives';
import { WorkspacePanel } from './components/workspace/WorkspacePanel';
import { useApplyPreferences } from './hooks/useApplyPreferences';
import { errorMessage } from './api/http';
import { storageHealth } from './state/library';
import { packStore } from './state/packStore';
import { preferencesStore, setPreferences } from './state/preferences';
import { useStore } from './state/store';
import { ui, uiStore } from './state/ui';
import { decodeShare, readShareHash } from './share/shareLink';

const LG_QUERY = '(min-width: 1024px)';

/** Workspace + export as a bottom sheet on small screens (the sidebar is hidden there). */
function MobileDrawer() {
  const open = useStore(uiStore, (s) => s.drawerOpen);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(LG_QUERY);
    const close = () => media.matches && ui.setDrawer(false);
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, [open]);

  if (!open) return null;
  return (
    <DialogShell onClose={() => ui.setDrawer(false)} label="Your pack" layoutClassName="items-end">
      <div className="relative flex max-h-[90dvh] w-full flex-col rounded-t-3xl bg-base-950 ring-1 ring-base-800 animate-slide-up">
        <div className="flex items-center justify-center px-4 pb-2 pt-3">
          <span className="h-1.5 w-10 rounded-full bg-base-700" aria-hidden />
          <IconButton label="Close pack" onClick={() => ui.setDrawer(false)} className="absolute right-3 top-2">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-6">
          <WorkspacePanel />
          <ExportPanel />
        </div>
      </div>
    </DialogShell>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
}

/** Global single-key shortcuts (ignored while typing or when a dialog is open). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || document.querySelector('dialog[open]')) return;
      const prefs = preferencesStore.getState();
      const actions: Record<string, () => void> = {
        '/': () => document.getElementById('mod-search')?.focus(),
        '?': () => ui.setShortcuts(true),
        g: () => setPreferences({ resultView: prefs.resultView === 'grid' ? 'list' : 'grid' }),
        h: () => setPreferences({ hideAdded: !prefs.hideAdded }),
        p: () => ui.setPacks(true),
        ',': () => ui.openSettings(),
      };
      const action = actions[event.key.toLowerCase()] ?? actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** Opens packs shared via `#pack=…` links (also when the hash changes on an open tab). */
function useShareLinks() {
  useEffect(() => {
    const open = async () => {
      const encoded = readShareHash(location.hash);
      if (!encoded) return;
      history.replaceState(null, '', location.pathname + location.search);
      try {
        ui.previewImport({ name: 'a share link', pack: await decodeShare(encoded) });
      } catch (error) {
        toast('error', errorMessage(error));
      }
    };
    void open();
    const onHash = () => void open();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
}

export default function App() {
  useApplyPreferences();
  useShortcuts();
  useShareLinks();
  const modCount = useStore(packStore, (s) => s.order.length);
  const packName = useStore(packStore, (s) => s.meta.name);
  const sidebarLeft = useStore(preferencesStore, (s) => s.sidebarSide === 'left');
  const storageOk = useStore(storageHealth, (s) => s.ok);

  useEffect(() => {
    document.title = `${packName} · Modpacker`;
  }, [packName]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklab,var(--accent-500)_9%,transparent),_transparent_55%)]">
      <a
        href="#search"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-accent-500 focus:px-3 focus:py-2 focus:text-on-accent"
      >
        Skip to search
      </a>
      <header className="sticky top-0 z-30 border-b border-base-800/80 bg-base-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-3 px-4 sm:px-6">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-on-accent shadow-lg shadow-accent-500/30">
            <Pickaxe className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-base-50">Modpacker</h1>
            <button
              type="button"
              onClick={() => ui.setPacks(true)}
              title="Switch, create or duplicate packs (P)"
              className="flex max-w-full items-center gap-1 rounded text-xs text-base-400 hover:text-base-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              <span className="truncate">
                <span className="font-semibold text-base-200">{packName}</span> · {modCount} mods
              </span>
              <ChevronDown className="size-3 shrink-0" aria-hidden />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={<FileUp className="size-4" />} onClick={ui.openImport} aria-label="Import a pack">
              <span className="hidden sm:inline">Import</span>
            </Button>
            <IconButton label="Keyboard shortcuts (?)" onClick={() => ui.setShortcuts(true)} className="hidden sm:inline-flex">
              <Keyboard className="size-4" />
            </IconButton>
            <Button variant="ghost" size="sm" icon={<Settings className="size-4" />} onClick={() => ui.openSettings()} aria-label="Settings (,)">
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
        {!storageOk && (
          <p className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-200">
            <TriangleAlert className="size-3.5" aria-hidden /> Your browser isn’t letting Modpacker save right now – changes may be lost after a reload.
          </p>
        )}
      </header>

      <main className="mx-auto flex max-w-[1680px] flex-col gap-6 px-4 py-6 sm:px-6">
        <ProfileBar />
        <div
          className={cx(
            'grid items-start gap-6',
            sidebarLeft ? 'lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]',
          )}
        >
          <div id="search" className={cx('min-w-0', sidebarLeft && 'lg:order-2')}>
            <SearchPanel />
          </div>
          <aside
            aria-label="Pack and export"
            className={cx(
              'hidden min-w-0 flex-col gap-6 lg:sticky lg:top-22 lg:flex lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:pr-1',
              sidebarLeft && 'lg:order-1',
            )}
          >
            <WorkspacePanel />
            <ExportPanel />
          </aside>
        </div>
      </main>

      <footer className="mx-auto max-w-[1680px] px-4 pb-24 pt-4 text-center text-xs text-base-600 sm:px-6 lg:pb-8">
        Made for players, by players · Everything runs in your browser – packs are built locally and saved only on this device. Not affiliated with Mojang,
        Modrinth or CurseForge.
      </footer>

      <button
        type="button"
        onClick={() => ui.setDrawer(true)}
        className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-accent-500 px-5 py-3 text-sm font-bold text-on-accent shadow-xl shadow-accent-500/30 active:scale-95 lg:hidden"
      >
        <Boxes className="size-4" aria-hidden /> Your pack · {modCount}
      </button>

      <MobileDrawer />
      <ModDetailsModal />
      <SettingsDialog />
      <ImportDialog />
      <PacksDialog />
      <ShortcutsDialog />
      <Toaster />
    </div>
  );
}
