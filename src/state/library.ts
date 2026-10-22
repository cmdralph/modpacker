import { packController } from './controller';
import { packFiles } from './files';
import { initialPackState, type PackState } from './pack';
import { packStore, restorePackState } from './packStore';
import { createStore } from './store';

export interface PackSummary {
  id: string;
  name: string;
  loader: string;
  gameVersion: string;
  modCount: number;
  updatedAt: number;
}

export interface LibraryState {
  activeId: string;
  packs: PackSummary[];
}

const LIBRARY_KEY = 'modpacker:library:v1';
const LEGACY_PACK_KEY = 'modpacker:pack:v1';
const packKey = (id: string) => `modpacker:pack:${id}`;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function summarize(id: string, state: PackState): PackSummary {
  return {
    id,
    name: state.meta.name,
    loader: state.profile.loader,
    gameVersion: state.profile.gameVersion,
    modCount: state.order.length,
    updatedAt: Date.now(),
  };
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isLibrary(value: unknown): value is LibraryState {
  const v = value as Partial<LibraryState> | null;
  return Boolean(v && typeof v.activeId === 'string' && Array.isArray(v.packs) && v.packs.every((p) => typeof p?.id === 'string' && typeof p.name === 'string'));
}

export const libraryStore = createStore<LibraryState, LibraryState>((_, next) => next, { activeId: '', packs: [] });

/** Writing localStorage failed (quota or private mode) – the UI warns that changes may be lost. */
export const storageHealth = createStore<{ ok: boolean }, boolean>((_, ok) => ({ ok }), { ok: true });

function saveLibrary(library: LibraryState) {
  libraryStore.dispatch(library);
  writeJson(LIBRARY_KEY, library);
}

function loadPack(id: string): PackState {
  return restorePackState(readJson(packKey(id))) ?? initialPackState();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Writes the active pack now (instead of waiting for the debounce). */
function flush() {
  clearTimeout(saveTimer);
  const { activeId, packs } = libraryStore.getState();
  if (!activeId) return;
  const state = packStore.getState();
  storageHealth.dispatch(writeJson(packKey(activeId), state));
  const summary = summarize(activeId, state);
  const existing = packs.find((p) => p.id === activeId);
  if (existing && existing.name === summary.name && existing.modCount === summary.modCount && existing.loader === summary.loader && existing.gameVersion === summary.gameVersion) {
    return;
  }
  saveLibrary({ activeId, packs: packs.some((p) => p.id === activeId) ? packs.map((p) => (p.id === activeId ? summary : p)) : [...packs, summary] });
}

function activate(id: string, state: PackState) {
  packController.reset();
  libraryStore.dispatch({ ...libraryStore.getState(), activeId: id });
  packStore.dispatch({ type: 'hydrate', state });
  flush();
  void packFiles.load(id);
}

export const library = {
  /** Loads the library (migrating the single pack saved by older versions) and opens the active pack. */
  init() {
    const stored = readJson(LIBRARY_KEY);
    let lib: LibraryState;
    if (isLibrary(stored) && stored.packs.length > 0) {
      lib = stored;
    } else {
      const id = newId();
      const legacy = restorePackState(readJson(LEGACY_PACK_KEY)) ?? initialPackState();
      writeJson(packKey(id), legacy);
      lib = { activeId: id, packs: [summarize(id, legacy)] };
      saveLibrary(lib);
      try {
        localStorage.removeItem(LEGACY_PACK_KEY);
      } catch {
        // Nothing to clean up.
      }
    }
    const activeId = lib.packs.some((p) => p.id === lib.activeId) ? lib.activeId : lib.packs[0]!.id;
    libraryStore.dispatch({ ...lib, activeId });
    packStore.dispatch({ type: 'hydrate', state: loadPack(activeId) });
    void packFiles.load(activeId);

    packStore.subscribe(() => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 250);
    });
    window.addEventListener('pagehide', flush);
    // Another tab changed the library: pick up its list (the open pack stays as it is here).
    window.addEventListener('storage', (event) => {
      if (event.key !== LIBRARY_KEY || !event.newValue) return;
      try {
        const next: unknown = JSON.parse(event.newValue);
        if (isLibrary(next)) libraryStore.dispatch({ ...next, activeId: libraryStore.getState().activeId });
      } catch {
        // Ignore malformed writes.
      }
    });
  },

  switchTo(id: string) {
    if (id === libraryStore.getState().activeId) return;
    flush();
    activate(id, loadPack(id));
  },

  /** Creates a pack (empty, or from `state`) and opens it. */
  create(state: PackState = initialPackState()): string {
    flush();
    const id = newId();
    writeJson(packKey(id), state);
    saveLibrary({ ...libraryStore.getState(), packs: [...libraryStore.getState().packs, summarize(id, state)] });
    activate(id, state);
    return id;
  },

  async duplicate(id: string) {
    flush();
    const source = loadPack(id);
    const copy: PackState = { ...source, meta: { ...source.meta, name: `${source.meta.name} (copy)` } };
    const newPackId = library.create(copy);
    await packFiles.copy(id, newPackId);
    await packFiles.load(newPackId);
  },

  remove(id: string) {
    const { activeId, packs } = libraryStore.getState();
    const remaining = packs.filter((p) => p.id !== id);
    try {
      localStorage.removeItem(packKey(id));
    } catch {
      // Already gone.
    }
    void packFiles.drop(id);
    if (remaining.length === 0) {
      saveLibrary({ activeId: '', packs: [] });
      library.create();
      return;
    }
    saveLibrary({ activeId, packs: remaining });
    if (id === activeId) activate(remaining[0]!.id, loadPack(remaining[0]!.id));
  },

  /** Everything needed to rescue the user's work if the app breaks. */
  backup(): string {
    flush();
    const { packs } = libraryStore.getState();
    return JSON.stringify({ exportedAt: new Date().toISOString(), packs: packs.map((p) => ({ ...p, state: readJson(packKey(p.id)) })) }, null, 2);
  },
};
