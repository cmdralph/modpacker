import { createStore } from './store';

export interface Settings {
  /** A personal CurseForge API key stored only in this browser (localStorage). */
  curseforgeApiKey: string;
  /** Base URL of a proxy that forwards to https://api.curseforge.com and injects the key. */
  curseforgeProxyUrl: string;
}

const STORAGE_KEY = 'modpacker:settings:v1';

function load(): Settings {
  const fallback: Settings = { curseforgeApiKey: '', curseforgeProxyUrl: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      curseforgeApiKey: typeof parsed.curseforgeApiKey === 'string' ? parsed.curseforgeApiKey : '',
      curseforgeProxyUrl: typeof parsed.curseforgeProxyUrl === 'string' ? parsed.curseforgeProxyUrl : '',
    };
  } catch {
    return fallback;
  }
}

export const settingsStore = createStore<Settings, Partial<Settings>>(
  (state, patch) => ({ ...state, ...patch }),
  typeof localStorage === 'undefined' ? { curseforgeApiKey: '', curseforgeProxyUrl: '' } : load(),
);

settingsStore.subscribe(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsStore.getState()));
  } catch {
    // Storage may be full or disabled (private mode); settings then last for the session only.
  }
});
