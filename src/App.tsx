import { Boxes, FileUp, Pickaxe, Settings, X } from 'lucide-react';
import { useEffect } from 'react';
import { ModDetailsModal } from './components/details/ModDetailsModal';
import { ExportPanel } from './components/export/ExportPanel';
import { ImportDialog } from './components/import/ImportDialog';
import { ProfileBar } from './components/profile/ProfileBar';
import { SearchPanel } from './components/search/SearchPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { Toaster } from './components/ui/Toasts';
import { Button, IconButton, cx } from './components/ui/primitives';
import { WorkspacePanel } from './components/workspace/WorkspacePanel';
import { useApplyPreferences } from './hooks/useApplyPreferences';
import { packStore } from './state/packStore';
import { preferencesStore } from './state/preferences';
import { useStore } from './state/store';
import { ui, uiStore } from './state/ui';

const LG_QUERY = '(min-width: 1024px)';

/** Workspace + export, shown as a sticky sidebar on large screens and as a drawer on small ones. */
function MobileDrawer() {
  const open = useStore(uiStore, (s) => s.drawerOpen);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(LG_QUERY);
    const close = () => media.matches && ui.setDrawer(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.setDrawer(false);
    media.addEventListener('change', close);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      media.removeEventListener('change', close);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Your pack">
      <div className="absolute inset-0 bg-base-950/75 backdrop-blur-sm animate-fade-in" onClick={() => ui.setDrawer(false)} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-3xl bg-base-950 ring-1 ring-base-800 animate-slide-up">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-base-700" aria-hidden />
          <IconButton label="Close pack" onClick={() => ui.setDrawer(false)} className="absolute right-3 top-2">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-3 pb-6">
          <WorkspacePanel />
          <ExportPanel />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  useApplyPreferences();
  const modCount = useStore(packStore, (s) => s.order.length);
  const packName = useStore(packStore, (s) => s.meta.name);
  const sidebarLeft = useStore(preferencesStore, (s) => s.sidebarSide === 'left');

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
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent-500 text-on-accent shadow-lg shadow-accent-500/30">
            <Pickaxe className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-base-50">Modpacker</h1>
            <p className="hidden truncate text-xs text-base-400 sm:block">
              Editing <span className="font-semibold text-base-200">{packName}</span> · {modCount} mods
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={<FileUp className="size-4" />} onClick={ui.openImport}>
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="ghost" size="sm" icon={<Settings className="size-4" />} onClick={() => ui.openSettings()}>
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
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
              'hidden flex-col gap-6 lg:sticky lg:top-22 lg:flex lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pb-2 lg:pr-1',
              sidebarLeft && 'lg:order-1',
            )}
          >
            <WorkspacePanel />
            <ExportPanel />
          </aside>
        </div>
      </main>

      <footer className="mx-auto max-w-[1680px] px-4 pb-24 pt-4 text-center text-xs text-base-600 sm:px-6 lg:pb-8">
        Everything runs in your browser – packs are compiled locally with JSZip. Not affiliated with Mojang, Modrinth or CurseForge.
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
      <Toaster />
    </div>
  );
}
