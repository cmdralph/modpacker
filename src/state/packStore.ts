import { LOADERS, type PackMod } from '../types';
import { initialPackState, packReducer, type PackAction, type PackState } from './pack';
import { createStore } from './store';

const STORAGE_KEY = 'modpacker:pack:v1';

function isPackState(value: unknown): value is PackState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PackState>;
  return (
    typeof v.meta?.name === 'string' &&
    typeof v.profile?.gameVersion === 'string' &&
    LOADERS.some((l) => l.id === v.profile?.loader) &&
    Array.isArray(v.order) &&
    typeof v.mods === 'object' &&
    v.mods !== null
  );
}

/** Restores the saved pack. Mods that were mid-resolution when the tab closed are flagged for retry. */
function loadPack(): PackState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialPackState();
    const parsed: unknown = JSON.parse(raw);
    if (!isPackState(parsed)) return initialPackState();
    const mods: Record<string, PackMod> = {};
    for (const [key, mod] of Object.entries(parsed.mods)) {
      mods[key] =
        mod.status === 'resolving'
          ? { ...mod, status: 'error', error: 'Resolution was interrupted. Retry to fetch the file.' }
          : mod;
    }
    return { ...parsed, mods, order: parsed.order.filter((k) => k in mods) };
  } catch {
    return initialPackState();
  }
}

export const packStore = createStore<PackState, PackAction>(packReducer, loadPack());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
packStore.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(packStore.getState()));
    } catch {
      // Storage full or disabled: the pack still works for this session.
    }
  }, 250);
});
