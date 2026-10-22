import { idbDelete, idbGet, idbSet } from '../lib/idb';
import { sanitizeRelativePath } from '../lib/paths';
import { createStore } from './store';

/** Where a file lives inside the pack archive. `client-`/`server-` roots are .mrpack-only. */
export type OverrideRoot = 'overrides' | 'client-overrides' | 'server-overrides';

export interface PackFile {
  root: OverrideRoot;
  /** Path below the root, e.g. `config/sodium-options.json`. Always sanitised. */
  path: string;
  size: number;
  data: Blob;
}

export interface FilesState {
  packId: string | null;
  files: PackFile[];
  /** IndexedDB is unavailable (private mode etc.): files only live until the tab closes. */
  volatile: boolean;
}

export const filesStore = createStore<FilesState, Partial<FilesState>>((state, patch) => ({ ...state, ...patch }), {
  packId: null,
  files: [],
  volatile: false,
});

const fileKey = (file: Pick<PackFile, 'root' | 'path'>) => `${file.root}/${file.path}`;

export function totalSize(files: PackFile[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

/** Merges files into a list; a file at the same location replaces the old one. Unsafe paths are dropped. */
export function mergeFiles(existing: PackFile[], incoming: PackFile[]): { files: PackFile[]; rejected: string[] } {
  const byKey = new Map(existing.map((f) => [fileKey(f), f]));
  const rejected: string[] = [];
  for (const file of incoming) {
    const path = sanitizeRelativePath(file.path);
    if (!path) {
      rejected.push(file.path);
      continue;
    }
    byKey.set(fileKey({ root: file.root, path }), { ...file, path });
  }
  const files = [...byKey.values()].toSorted((a, b) => fileKey(a).localeCompare(fileKey(b)));
  return { files, rejected };
}

async function persist(packId: string, files: PackFile[]) {
  try {
    if (files.length === 0) await idbDelete(packId);
    else await idbSet(packId, files);
    if (filesStore.getState().volatile) filesStore.dispatch({ volatile: false });
  } catch {
    filesStore.dispatch({ volatile: true });
  }
}

/** Bumped on every local change, so a slower load that started earlier can't overwrite it. */
let generation = 0;

export const packFiles = {
  /** Loads the extra files saved for a pack. */
  async load(packId: string) {
    const started = ++generation;
    filesStore.dispatch({ packId, files: [] });
    try {
      const files = (await idbGet<PackFile[]>(packId)) ?? [];
      if (generation === started && filesStore.getState().packId === packId) filesStore.dispatch({ files, volatile: false });
    } catch {
      filesStore.dispatch({ volatile: true });
    }
  },
  async add(incoming: PackFile[]): Promise<string[]> {
    generation += 1;
    const { packId, files } = filesStore.getState();
    const merged = mergeFiles(files, incoming);
    filesStore.dispatch({ files: merged.files });
    if (packId) await persist(packId, merged.files);
    return merged.rejected;
  },
  async replace(files: PackFile[]) {
    generation += 1;
    const { packId } = filesStore.getState();
    const merged = mergeFiles([], files);
    filesStore.dispatch({ files: merged.files });
    if (packId) await persist(packId, merged.files);
  },
  async remove(predicate: (file: PackFile) => boolean) {
    generation += 1;
    const { packId, files } = filesStore.getState();
    const next = files.filter((f) => !predicate(f));
    filesStore.dispatch({ files: next });
    if (packId) await persist(packId, next);
  },
  /** Copies one pack's files to another (used when duplicating a pack). */
  async copy(fromId: string, toId: string) {
    try {
      const files = await idbGet<PackFile[]>(fromId);
      if (files?.length) await idbSet(toId, files);
    } catch {
      // Nothing to copy when storage is unavailable.
    }
  },
  async drop(packId: string) {
    try {
      await idbDelete(packId);
    } catch {
      // Already gone or storage unavailable.
    }
  },
};
