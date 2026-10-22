import { Boxes, Pickaxe, Settings } from 'lucide-react';
import { useState } from 'react';
import { ExportPanel } from './components/export/ExportPanel';
import { ProfileBar } from './components/profile/ProfileBar';
import { SearchPanel } from './components/search/SearchPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { Toaster } from './components/ui/Toasts';
import { Button } from './components/ui/primitives';
import { WorkspacePanel } from './components/workspace/WorkspacePanel';
import { packStore } from './state/packStore';
import { useStore } from './state/store';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const modCount = useStore(packStore, (s) => s.order.length);
  const packName = useStore(packStore, (s) => s.meta.name);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.08),_transparent_50%)]">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30">
            <Pickaxe className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-white">Modpacker</h1>
            <p className="hidden truncate text-xs text-slate-400 sm:block">Modrinth + CurseForge modpack builder · {packName}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={<Settings className="size-4" />} onClick={() => setSettingsOpen(true)}>
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6">
        <ProfileBar />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <SearchPanel onOpenSettings={() => setSettingsOpen(true)} />
          <aside className="flex flex-col gap-6 lg:sticky lg:top-22">
            <WorkspacePanel />
            <ExportPanel />
          </aside>
        </div>
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-24 pt-4 text-center text-xs text-slate-600 sm:px-6 lg:pb-8">
        Everything runs in your browser – packs are compiled locally with JSZip. Not affiliated with Mojang, Modrinth or CurseForge.
      </footer>

      {/* Mobile shortcut to the workspace, which sits below the search results on small screens. */}
      <a
        href="#workspace"
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-emerald-500/30 lg:hidden"
      >
        <Boxes className="size-4" aria-hidden /> Pack ({modCount})
      </a>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toaster />
    </div>
  );
}
