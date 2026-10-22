import { Eye, EyeOff, KeyRound, Server, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCurseForgeAccess } from '../../api/curseforgeConfig';
import { settingsStore } from '../../state/settings';
import { useStore } from '../../state/store';
import { Modal } from '../ui/Modal';
import { Button, Callout, Field, inputClass } from '../ui/primitives';
import { toast } from '../ui/Toasts';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useStore(settingsStore, (s) => s);
  const [apiKey, setApiKey] = useState(settings.curseforgeApiKey);
  const [proxyUrl, setProxyUrl] = useState(settings.curseforgeProxyUrl);
  const [showKey, setShowKey] = useState(false);
  const [proxyError, setProxyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setApiKey(settings.curseforgeApiKey);
    setProxyUrl(settings.curseforgeProxyUrl);
    setProxyError(null);
    setShowKey(false);
  }, [open, settings]);

  const access = getCurseForgeAccess();

  function save() {
    const trimmedProxy = proxyUrl.trim();
    if (trimmedProxy) {
      try {
        const url = new URL(trimmedProxy);
        if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
          setProxyError('Use an https:// URL (http is only allowed for localhost).');
          return;
        }
      } catch {
        setProxyError('That is not a valid URL.');
        return;
      }
    }
    settingsStore.dispatch({ curseforgeApiKey: apiKey.trim(), curseforgeProxyUrl: trimmedProxy });
    toast('success', 'Settings saved.');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={<KeyRound className="size-6 text-orange-400" />}
      title="CurseForge access"
      description="CurseForge’s API requires an x-api-key header on every request. Modrinth works without any setup."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Callout
          tone={access.mode === 'disabled' ? 'warning' : 'success'}
          icon={access.mode === 'disabled' ? <TriangleAlert className="size-4" /> : <ShieldCheck className="size-4" />}
        >
          {access.mode === 'proxy' && `Requests go through your proxy at ${access.baseUrl}; the key stays server-side.`}
          {access.mode === 'direct' && 'Requests go directly to api.curseforge.com with an API key from this browser.'}
          {access.mode === 'disabled' && 'CurseForge is not configured. Search and export use Modrinth only.'}
        </Callout>

        <Field
          label="Proxy URL (recommended)"
          htmlFor="cf-proxy"
          hint="A relay that forwards to https://api.curseforge.com and adds the key server-side. Takes priority over an API key."
        >
          <div className="relative">
            <Server className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              id="cf-proxy"
              className={`${inputClass} pl-9`}
              placeholder="https://cf-proxy.example.workers.dev"
              value={proxyUrl}
              onChange={(e) => {
                setProxyUrl(e.target.value);
                setProxyError(null);
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
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <p className="text-xs leading-relaxed text-slate-500">
          Never deploy this site with a shared key baked into the build: anything shipped to the browser is public. Host the proxy in{' '}
          <code className="rounded bg-slate-800 px-1 text-slate-300">proxy/cloudflare-worker.js</code> with the key as a secret instead.
        </p>
      </div>
    </Modal>
  );
}
