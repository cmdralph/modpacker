import { LOADERS, type PackMod } from '../types';
import { initialPackState, packReducer, type PackAction, type PackState } from './pack';
import { createStore } from './store';

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

/**
 * Validates and normalises a saved pack. Mods that were mid-resolution when the tab closed are
 * flagged for retry, and fields added in later versions get defaults.
 */
export function restorePackState(raw: unknown): PackState | null {
  if (!isPackState(raw)) return null;
  const fallback = initialPackState();
  const mods: Record<string, PackMod> = {};
  for (const [key, mod] of Object.entries(raw.mods)) {
    if (!mod || typeof mod !== 'object' || typeof mod.title !== 'string') continue;
    mods[key] = mod.status === 'resolving' ? { ...mod, status: 'error', error: 'Resolution was interrupted. Retry to fetch the file.' } : mod;
  }
  return {
    meta: {
      name: raw.meta.name,
      version: typeof raw.meta.version === 'string' ? raw.meta.version : fallback.meta.version,
      author: typeof raw.meta.author === 'string' ? raw.meta.author : fallback.meta.author,
      description: typeof raw.meta.description === 'string' ? raw.meta.description : '',
    },
    profile: raw.profile,
    loaderVersion: typeof raw.loaderVersion === 'string' ? raw.loaderVersion : null,
    mods,
    order: raw.order.filter((k) => k in mods),
  };
}

/** The pack being edited. Persistence and switching between packs live in `library.ts`. */
export const packStore = createStore<PackState, PackAction>(packReducer, initialPackState());
