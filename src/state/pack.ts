import type { ProjectInfo } from '../api/common';
import { modKey } from '../api/common';
import type { CurseForgeFileRef, ModrinthFileRef, PackMeta, PackMod, Profile } from '../types';

export interface PackState {
  meta: PackMeta;
  profile: Profile;
  mods: Record<string, PackMod>;
  /** Insertion order of mod keys. */
  order: string[];
}

export type PackAction =
  | { type: 'hydrate'; state: PackState }
  | { type: 'setMeta'; patch: Partial<PackMeta> }
  | { type: 'setProfile'; profile: Profile }
  | { type: 'clearMods' }
  | { type: 'addMod'; info: ProjectInfo; explicit: boolean; requiredBy: string | null; pinnedFileId: string | null }
  | { type: 'modResolving'; key: string }
  | {
      type: 'modResolved';
      key: string;
      versionLabel: string;
      modrinth: ModrinthFileRef | null;
      curseforge: CurseForgeFileRef | null;
      declaredIncompatibilities: string[];
    }
  | { type: 'modFailed'; key: string; status: 'incompatible' | 'error'; error: string }
  | { type: 'setCrossRef'; key: string; modrinth?: ModrinthFileRef; curseforge?: CurseForgeFileRef }
  | { type: 'removeMods'; keys: string[] }
  | { type: 'resetForRevalidation' };

export const DEFAULT_PROFILE: Profile = { gameVersion: '1.21.1', loader: 'fabric' };

export function initialPackState(): PackState {
  return {
    meta: { name: 'My Modpack', version: '1.0.0', author: 'Web Builder' },
    profile: DEFAULT_PROFILE,
    mods: {},
    order: [],
  };
}

function updateMod(state: PackState, key: string, patch: Partial<PackMod>): PackState {
  const mod = state.mods[key];
  if (!mod) return state;
  return { ...state, mods: { ...state.mods, [key]: { ...mod, ...patch } } };
}

/**
 * Removes the given mods, then repeatedly drops auto-added dependencies that
 * no remaining mod requires any more.
 */
function removeWithOrphans(state: PackState, keys: string[]): PackState {
  const mods = { ...state.mods };
  let queue = keys.filter((k) => k in mods);
  if (queue.length === 0) return state;

  while (queue.length > 0) {
    const removed = new Set(queue);
    queue.forEach((k) => delete mods[k]);
    const nextQueue: string[] = [];
    for (const [key, mod] of Object.entries(mods)) {
      if (!mod.requiredBy.some((r) => removed.has(r))) continue;
      const requiredBy = mod.requiredBy.filter((r) => !removed.has(r));
      mods[key] = { ...mod, requiredBy };
      if (!mod.explicit && requiredBy.length === 0) nextQueue.push(key);
    }
    queue = nextQueue;
  }
  return { ...state, mods, order: state.order.filter((k) => k in mods) };
}

export function packReducer(state: PackState, action: PackAction): PackState {
  switch (action.type) {
    case 'hydrate':
      return action.state;

    case 'setMeta':
      return { ...state, meta: { ...state.meta, ...action.patch } };

    case 'setProfile':
      return { ...state, profile: action.profile };

    case 'clearMods':
      return { ...state, mods: {}, order: [] };

    case 'addMod': {
      const key = modKey(action.info.source, action.info.projectId);
      const existing = state.mods[key];
      if (existing) {
        const requiredBy =
          action.requiredBy && !existing.requiredBy.includes(action.requiredBy)
            ? [...existing.requiredBy, action.requiredBy]
            : existing.requiredBy;
        const explicit = existing.explicit || action.explicit;
        if (requiredBy === existing.requiredBy && explicit === existing.explicit) return state;
        return updateMod(state, key, { requiredBy, explicit });
      }
      const mod: PackMod = {
        ...action.info,
        key,
        status: 'resolving',
        error: null,
        versionLabel: null,
        modrinth: null,
        curseforge: null,
        explicit: action.explicit,
        requiredBy: action.requiredBy ? [action.requiredBy] : [],
        pinnedFileId: action.pinnedFileId,
        declaredIncompatibilities: [],
        addedAt: Date.now(),
      };
      return { ...state, mods: { ...state.mods, [key]: mod }, order: [...state.order, key] };
    }

    case 'modResolving':
      return updateMod(state, action.key, { status: 'resolving', error: null });

    case 'modResolved': {
      const mod = state.mods[action.key];
      if (!mod) return state;
      return updateMod(state, action.key, {
        status: 'ready',
        error: null,
        versionLabel: action.versionLabel,
        // Keep an existing cross-platform match only if the native file did not change.
        modrinth: action.modrinth ?? (mod.curseforge?.fileId === action.curseforge?.fileId ? mod.modrinth : null),
        curseforge: action.curseforge ?? (mod.modrinth?.versionId === action.modrinth?.versionId ? mod.curseforge : null),
        declaredIncompatibilities: action.declaredIncompatibilities,
      });
    }

    case 'modFailed':
      return updateMod(state, action.key, {
        status: action.status,
        error: action.error,
        versionLabel: null,
        modrinth: null,
        curseforge: null,
        declaredIncompatibilities: [],
      });

    case 'setCrossRef': {
      const patch: Partial<PackMod> = {};
      if (action.modrinth) patch.modrinth = action.modrinth;
      if (action.curseforge) patch.curseforge = action.curseforge;
      return updateMod(state, action.key, patch);
    }

    case 'removeMods':
      return removeWithOrphans(state, action.keys);

    case 'resetForRevalidation': {
      const mods: Record<string, PackMod> = {};
      for (const key of state.order) {
        const mod = state.mods[key];
        if (!mod?.explicit) continue;
        mods[key] = {
          ...mod,
          status: 'resolving',
          error: null,
          versionLabel: null,
          modrinth: null,
          curseforge: null,
          requiredBy: [],
          pinnedFileId: null,
          declaredIncompatibilities: [],
        };
      }
      return { ...state, mods, order: state.order.filter((k) => k in mods) };
    }
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function orderedMods(state: PackState): PackMod[] {
  return state.order.map((k) => state.mods[k]).filter((m): m is PackMod => Boolean(m));
}

export interface Conflict {
  mod: PackMod;
  other: PackMod;
}

/** Pairs of pack mods where one declares the other incompatible. */
export function findConflicts(state: PackState): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const mod of orderedMods(state)) {
    for (const otherKey of mod.declaredIncompatibilities) {
      const other = state.mods[otherKey];
      if (other) conflicts.push({ mod, other });
    }
  }
  return conflicts;
}

/**
 * Mods added from both platforms that point at the very same jar (detected via SHA-1),
 * which would otherwise end up in the pack twice.
 */
export function findDuplicates(state: PackState): Array<[PackMod, PackMod]> {
  const bySha1 = new Map<string, PackMod>();
  const duplicates: Array<[PackMod, PackMod]> = [];
  for (const mod of orderedMods(state)) {
    const hashes = new Set([mod.modrinth?.sha1, mod.curseforge?.sha1].filter((h): h is string => Boolean(h)));
    for (const hash of hashes) {
      const first = bySha1.get(hash);
      if (first && first.key !== mod.key) {
        duplicates.push([first, mod]);
        break;
      }
      bySha1.set(hash, mod);
    }
  }
  return duplicates;
}
