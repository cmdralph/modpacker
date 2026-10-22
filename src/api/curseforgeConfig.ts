import { settingsStore } from '../state/settings';

export const CURSEFORGE_API = 'https://api.curseforge.com';
export const MINECRAFT_GAME_ID = 432;
export const MODS_CLASS_ID = 6;

export type CurseForgeAccessMode = 'proxy' | 'direct' | 'disabled';

export interface CurseForgeAccess {
  mode: CurseForgeAccessMode;
  baseUrl: string;
  headers: Record<string, string>;
}

const ENV_PROXY_URL = (import.meta.env.VITE_CURSEFORGE_PROXY_URL ?? '').trim();
const ENV_API_KEY = (import.meta.env.VITE_CURSEFORGE_API_KEY ?? '').trim();

/**
 * Decides how requests reach the CurseForge Core API.
 *
 * The API requires an `x-api-key` header on every request. There are three ways to supply it:
 *
 * 1. PROXY (production): `VITE_CURSEFORGE_PROXY_URL` (or the proxy URL in Settings) points at a
 *    small server-side relay such as `proxy/cloudflare-worker.js`. The relay holds the key as a
 *    secret, adds the `x-api-key` header itself and returns permissive CORS headers. The browser
 *    never sees the key, so this is the only setup that is safe to deploy publicly.
 *
 * 2. DIRECT with a user-supplied key: each visitor pastes their own key from
 *    console.curseforge.com into Settings. It is stored in that browser's localStorage only and
 *    sent straight to api.curseforge.com. The key is theirs, so nothing secret ships in the bundle.
 *
 * 3. DIRECT with `VITE_CURSEFORGE_API_KEY` (local development only): Vite inlines the value into
 *    the JavaScript bundle, so anyone loading the page can read it. Never deploy such a build.
 */
export function getCurseForgeAccess(): CurseForgeAccess {
  const settings = settingsStore.getState();
  const proxyUrl = settings.curseforgeProxyUrl.trim() || ENV_PROXY_URL;
  if (proxyUrl) {
    // The proxy injects `x-api-key` server-side – no secret header from the browser.
    return { mode: 'proxy', baseUrl: proxyUrl.replace(/\/+$/, ''), headers: {} };
  }

  const apiKey = settings.curseforgeApiKey.trim() || ENV_API_KEY;
  if (apiKey) {
    // Direct call: the key travels from the browser. Acceptable only for a key the visitor owns
    // (Settings) or a local dev build (env). See the note above.
    return { mode: 'direct', baseUrl: CURSEFORGE_API, headers: { 'x-api-key': apiKey } };
  }

  return { mode: 'disabled', baseUrl: CURSEFORGE_API, headers: {} };
}

export function isCurseForgeConfigured(): boolean {
  return getCurseForgeAccess().mode !== 'disabled';
}
