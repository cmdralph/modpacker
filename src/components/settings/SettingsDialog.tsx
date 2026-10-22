import { Check, Eye, EyeOff, KeyRound, LayoutGrid, List, Palette, PanelLeft, PanelRight, RotateCcw, Server, Settings, ShieldCheck, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { getCurseForgeAccess } from '../../api/curseforgeConfig';
import { ACCENTS, THEMES, preferencesStore, setPreferences, type Preferences } from '../../state/preferences';
import { settingsStore } from '../../state/settings';
import { useStore } from '../../state/store';
import { ui, uiStore, type SettingsTab } from '../../state/ui';
import { Modal } from '../ui/Modal';
import { Button, Callout, Field, Segmented, Switch, cx, inputClass } from '../ui/primitives';
import { toast } from '../ui/Toasts';

function Section({ title, children, description }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-base-400">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-base-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function SwatchButton({ selected, onClick, label, swatch }: { selected: boolean; onClick: () => void; label: string; swatch: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
        selected ? 'bg-base-800 text-base-50 ring-2 ring-accent-500' : 'text-base-400 ring-1 ring-base-800 hover:bg-base-800/60 hover:text-base-200',
      )}
    >
      <span className="relative size-9 rounded-full ring-1 ring-black/20" style={{ background: swatch }}>
        {selected && <Check className="absolute inset-0 m-auto size-4 text-white drop-shadow" />}
      </span>
      {label}
    </button>
  );
}

function AppearanceTab({ prefs }: { prefs: Preferences }) {
  return (
    <div className="space-y-6">
      <Section title="Theme">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {THEMES.map((t) => (
            <SwatchButton key={t.id} label={t.label} swatch={t.swatch} selected={prefs.theme === t.id} onClick={() => setPreferences({ theme: t.id })} />
          ))}
        </div>
      </Section>
      <Section title="Accent colour" description="Used for buttons, highlights and focus rings. Platform badges keep their brand colours.">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {ACCENTS.map((a) => (
            <SwatchButton key={a.id} label={a.label} swatch={a.swatch} selected={prefs.accent === a.id} onClick={() => setPreferences({ accent: a.id })} />
          ))}
        </div>
      </Section>
      <Section title="Text size" description="Scales the whole interface.">
        <Segmented
          label="Text size"
          value={String(prefs.fontScale)}
          onChange={(v) => setPreferences({ fontScale: Number(v) as Preferences['fontScale'] })}
          className="w-full"
          options={[
            { value: '90', label: 'Small' },
            { value: '100', label: 'Default' },
            { value: '110', label: 'Large' },
            { value: '120', label: 'Larger' },
          ]}
        />
      </Section>
    </div>
  );
}

function LayoutTab({ prefs }: { prefs: Preferences }) {
  return (
    <div className="space-y-6">
      <Section title="Density">
        <Segmented
          label="Density"
          value={prefs.density}
          onChange={(density) => setPreferences({ density })}
          className="w-full"
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </Section>
      <Section title="Search results">
        <Segmented
          label="Result layout"
          value={prefs.resultView}
          onChange={(resultView) => setPreferences({ resultView })}
          className="w-full"
          options={[
            { value: 'grid', label: <><LayoutGrid className="size-4" /> Grid</> },
            { value: 'list', label: <><List className="size-4" /> List</> },
          ]}
        />
      </Section>
      <Section title="Pack sidebar" description="Which side the pack and export panels sit on (large screens).">
        <Segmented
          label="Sidebar side"
          value={prefs.sidebarSide}
          onChange={(sidebarSide) => setPreferences({ sidebarSide })}
          className="w-full"
          options={[
            { value: 'left', label: <><PanelLeft className="size-4" /> Left</> },
            { value: 'right', label: <><PanelRight className="size-4" /> Right</> },
          ]}
        />
      </Section>
      <Section title="Behaviour">
        <div className="space-y-4">
          <Switch
            id="pref-infinite"
            label="Infinite scroll"
            description="Load more results automatically as you scroll."
            checked={prefs.infiniteScroll}
            onChange={(infiniteScroll) => setPreferences({ infiniteScroll })}
          />
          <Switch
            id="pref-hide-added"
            label="Hide mods already in the pack"
            description="Also hides the same mod from the other platform when it’s a known match."
            checked={prefs.hideAdded}
            onChange={(hideAdded) => setPreferences({ hideAdded })}
          />
          <Switch
            id="pref-descriptions"
            label="Show descriptions"
            description="Turn off for a denser, title-only results view."
            checked={prefs.showDescriptions}
            onChange={(showDescriptions) => setPreferences({ showDescriptions })}
          />
        </div>
      </Section>
    </div>
  );
}

function CurseForgeTab({ apiKey, setApiKey, proxyUrl, setProxyUrl, proxyError, clearProxyError }: {
  apiKey: string;
  setApiKey: (v: string) => void;
  proxyUrl: string;
  setProxyUrl: (v: string) => void;
  proxyError: string | null;
  clearProxyError: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  useStore(settingsStore, (s) => s);
  const access = getCurseForgeAccess();

  return (
    <div className="space-y-5">
      <p className="text-sm text-base-400">CurseForge’s API requires an x-api-key header on every request. Modrinth works without any setup.</p>
      <Callout
        tone={access.mode === 'disabled' ? 'warning' : 'success'}
        icon={access.mode === 'disabled' ? <TriangleAlert className="size-4" /> : <ShieldCheck className="size-4" />}
      >
        {access.mode === 'proxy' && `Requests go through your proxy at ${access.baseUrl}; the key stays server-side.`}
        {access.mode === 'direct' && 'Requests go directly to api.curseforge.com with an API key from this browser.'}
        {access.mode === 'disabled' && 'CurseForge is not configured. Search and export use Modrinth only.'}
      </Callout>

      <Field label="Proxy URL (recommended)" htmlFor="cf-proxy" hint="A relay that forwards to https://api.curseforge.com and adds the key server-side. Takes priority over an API key.">
        <div className="relative">
          <Server className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-base-500" aria-hidden />
          <input
            id="cf-proxy"
            className={`${inputClass} pl-9`}
            placeholder="https://cf-proxy.example.workers.dev"
            value={proxyUrl}
            onChange={(e) => {
              setProxyUrl(e.target.value);
              clearProxyError();
            }}
            aria-invalid={proxyError !== null}
          />
        </div>
        {proxyError && <p className="text-xs text-rose-300">{proxyError}</p>}
      </Field>

      <Field
        label="Personal API key"
        htmlFor="cf-key"
        hint={
          <>
            Get a free key at{' '}
            <a className="text-orange-300 underline" href="https://console.curseforge.com/" target="_blank" rel="noreferrer">
              console.curseforge.com
            </a>
            . It is stored only in this browser’s localStorage and sent only to api.curseforge.com.
          </>
        }
      >
        <div className="relative">
          <input
            id="cf-key"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} pr-10 font-mono`}
            placeholder="$2a$10$…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-base-400 hover:text-base-50"
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
          >
            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <p className="text-xs leading-relaxed text-base-500">
        Never deploy this site with a shared key baked into the build: anything shipped to the browser is public. Host the proxy in{' '}
        <code className="rounded bg-base-800 px-1 text-base-300">proxy/cloudflare-worker.js</code> with the key as a secret instead.
      </p>
    </div>
  );
}

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette className="size-4" /> },
  { id: 'layout', label: 'Layout', icon: <SlidersHorizontal className="size-4" /> },
  { id: 'curseforge', label: 'CurseForge', icon: <KeyRound className="size-4" /> },
];

export function SettingsDialog() {
  const tab = useStore(uiStore, (s) => s.settingsTab);
  // Mounted only while open, so the CurseForge form always starts from the saved values.
  return tab ? <SettingsPanel tab={tab} /> : null;
}

function SettingsPanel({ tab }: { tab: SettingsTab }) {
  const prefs = useStore(preferencesStore, (s) => s);
  const settings = useStore(settingsStore, (s) => s);
  const [apiKey, setApiKey] = useState(settings.curseforgeApiKey);
  const [proxyUrl, setProxyUrl] = useState(settings.curseforgeProxyUrl);
  const [proxyError, setProxyError] = useState<string | null>(null);

  const dirty = apiKey.trim() !== settings.curseforgeApiKey || proxyUrl.trim() !== settings.curseforgeProxyUrl;

  function saveCurseForge(): boolean {
    const trimmedProxy = proxyUrl.trim();
    if (trimmedProxy) {
      try {
        const url = new URL(trimmedProxy);
        if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
          setProxyError('Use an https:// URL (http is only allowed for localhost).');
          return false;
        }
      } catch {
        setProxyError('That is not a valid URL.');
        return false;
      }
    }
    settingsStore.dispatch({ curseforgeApiKey: apiKey.trim(), curseforgeProxyUrl: trimmedProxy });
    toast('success', 'CurseForge settings saved.');
    return true;
  }

  function done() {
    if (dirty && !saveCurseForge()) {
      ui.openSettings('curseforge');
      return;
    }
    ui.closeSettings();
  }

  return (
    <Modal
      open
      onClose={ui.closeSettings}
      size="lg"
      icon={<Settings className="size-6 text-accent-400" />}
      title="Settings"
      description="Appearance and layout changes apply instantly and are remembered in this browser."
      headerExtra={
        <div role="tablist" aria-label="Settings sections" className="grid grid-cols-3 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => ui.openSettings(t.id)}
              className={cx(
                'inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 max-sm:[&>svg]:hidden',
                tab === t.id ? 'bg-base-800 text-base-50' : 'text-base-400 hover:bg-base-800/60 hover:text-base-200',
              )}
            >
              {t.icon}
              {t.label}
              {t.id === 'curseforge' && dirty && <span className="size-1.5 rounded-full bg-amber-400" aria-label="unsaved changes" />}
            </button>
          ))}
        </div>
      }
      footer={
        <>
          {tab !== 'curseforge' && (
            <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => preferencesStore.dispatch('reset')} className="sm:mr-auto">
              Reset to defaults
            </Button>
          )}
          {dirty && (
            <Button variant="ghost" onClick={ui.closeSettings}>
              Discard
            </Button>
          )}
          <Button variant="primary" onClick={done}>
            {dirty ? 'Save & close' : 'Done'}
          </Button>
        </>
      }
    >
      {tab === 'appearance' && <AppearanceTab prefs={prefs} />}
      {tab === 'layout' && <LayoutTab prefs={prefs} />}
      {tab === 'curseforge' && (
        <CurseForgeTab
          apiKey={apiKey}
          setApiKey={setApiKey}
          proxyUrl={proxyUrl}
          setProxyUrl={setProxyUrl}
          proxyError={proxyError}
          clearProxyError={() => setProxyError(null)}
        />
      )}
    </Modal>
  );
}
