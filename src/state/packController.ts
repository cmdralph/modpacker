import {
  NoCompatibleVersionError,
  modKey,
  type DependencyRef,
  type ProjectInfo,
  type ResolvedFile,
} from '../api/common';
import { getCurseForgeProjectInfos, matchCurseForgeFingerprints, resolveCurseForgeFile } from '../api/curseforge';
import { errorMessage, fetchBytes, isAbortError } from '../api/http';
import { getModrinthProjectInfos, lookupModrinthFilesBySha1, resolveModrinthFile } from '../api/modrinth';
import { curseForgeFingerprint } from '../lib/murmur2';
import { mapLimit } from '../lib/async';
import type { CurseForgeFileRef, ModSource, ModrinthFileRef, Profile } from '../types';
import type { PackAction, PackState } from './pack';
import type { Store } from './store';

/** Remote operations the controller depends on – injectable for tests. */
export interface PackApi {
  resolve(source: ModSource, projectId: string, profile: Profile, pinned: string | null, signal: AbortSignal): Promise<ResolvedFile>;
  projectInfos(source: ModSource, projectIds: string[], signal: AbortSignal): Promise<ProjectInfo[]>;
  modrinthBySha1(sha1s: string[], signal?: AbortSignal): Promise<Map<string, ModrinthFileRef>>;
  curseForgeByFingerprint(fingerprints: number[], signal?: AbortSignal): Promise<Map<number, CurseForgeFileRef>>;
  downloadBytes(url: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export const liveApi: PackApi = {
  resolve: (source, projectId, profile, pinned, signal) =>
    source === 'modrinth'
      ? resolveModrinthFile(projectId, profile, pinned, signal)
      : resolveCurseForgeFile(projectId, profile, pinned, signal),
  projectInfos: (source, ids, signal) =>
    source === 'modrinth' ? getModrinthProjectInfos(ids, signal) : getCurseForgeProjectInfos(ids, signal),
  modrinthBySha1: lookupModrinthFilesBySha1,
  curseForgeByFingerprint: matchCurseForgeFingerprints,
  downloadBytes: (url, signal) => fetchBytes(url, { signal }),
};

export interface PackNotifier {
  (kind: 'info' | 'warning' | 'error', message: string): void;
}

const RESOLVE_CONCURRENCY = 4;

/**
 * Coordinates the async side of the workspace: resolving the newest compatible file
 * for each mod, pulling in required dependencies, cross-referencing files between
 * platforms and re-validating everything when the profile changes.
 */
export function createPackController(store: Store<PackState, PackAction>, api: PackApi, notify: PackNotifier) {
  /** Bumped whenever the profile changes so results from older resolutions are discarded. */
  let epoch = 0;
  let controller = new AbortController();
  const inFlight = new Set<string>();

  async function addDependencies(parentKey: string, deps: DependencyRef[], currentEpoch: number) {
    const bySource = new Map<ModSource, DependencyRef[]>();
    for (const dep of deps) {
      const key = modKey(dep.source, dep.projectId);
      if (key === parentKey) continue;
      if (store.getState().mods[key]) {
        // Already in the pack – just record the relationship.
        const info = store.getState().mods[key]!;
        store.dispatch({ type: 'addMod', info, explicit: false, requiredBy: parentKey, pinnedFileId: null });
        continue;
      }
      bySource.set(dep.source, [...(bySource.get(dep.source) ?? []), dep]);
    }

    for (const [source, refs] of bySource) {
      let infos: ProjectInfo[];
      try {
        infos = await api.projectInfos(source, refs.map((r) => r.projectId), controller.signal);
      } catch (error) {
        if (isAbortError(error) || currentEpoch !== epoch) return;
        const parent = store.getState().mods[parentKey];
        notify('error', `Could not load dependencies of ${parent?.title ?? parentKey}: ${errorMessage(error)}`);
        continue;
      }
      if (currentEpoch !== epoch || !store.getState().mods[parentKey]) return;

      await Promise.all(
        infos.map((info) => {
          const ref = refs.find((r) => r.projectId === info.projectId);
          return addMod(info, { explicit: false, requiredBy: parentKey, pinnedFileId: ref?.pinnedFileId ?? null });
        }),
      );
    }
  }

  /** Finds a byte-identical copy of a CurseForge file on Modrinth so it can go into a .mrpack. */
  async function crossReferenceToModrinth(key: string, sha1: string, currentEpoch: number) {
    try {
      const match = (await api.modrinthBySha1([sha1], controller.signal)).get(sha1);
      if (match && currentEpoch === epoch) store.dispatch({ type: 'setCrossRef', key, modrinth: match });
    } catch {
      // Optional enrichment – the export dialog offers a manual retry.
    }
  }

  async function resolve(key: string): Promise<void> {
    const mod = store.getState().mods[key];
    if (!mod || inFlight.has(key)) return;
    inFlight.add(key);
    const currentEpoch = epoch;
    const { profile } = store.getState();
    store.dispatch({ type: 'modResolving', key });

    try {
      const resolved = await api.resolve(mod.source, mod.projectId, profile, mod.pinnedFileId, controller.signal);
      if (currentEpoch !== epoch || !store.getState().mods[key]) return;

      store.dispatch({
        type: 'modResolved',
        key,
        versionLabel: resolved.versionLabel,
        modrinth: resolved.modrinth,
        curseforge: resolved.curseforge,
        declaredIncompatibilities: resolved.incompatibleProjects.map((d) => modKey(d.source, d.projectId)),
      });

      const sha1 = resolved.curseforge?.sha1;
      await Promise.all([
        sha1 ? crossReferenceToModrinth(key, sha1, currentEpoch) : Promise.resolve(),
        addDependencies(key, resolved.requiredDependencies, currentEpoch),
      ]);
    } catch (error) {
      if (isAbortError(error) || currentEpoch !== epoch) return;
      const incompatible = error instanceof NoCompatibleVersionError;
      store.dispatch({ type: 'modFailed', key, status: incompatible ? 'incompatible' : 'error', error: errorMessage(error) });
    } finally {
      inFlight.delete(key);
    }
  }

  async function addMod(
    info: ProjectInfo,
    options: { explicit: boolean; requiredBy?: string | null; pinnedFileId?: string | null },
  ): Promise<void> {
    const key = modKey(info.source, info.projectId);
    const existed = Boolean(store.getState().mods[key]);
    store.dispatch({
      type: 'addMod',
      info,
      explicit: options.explicit,
      requiredBy: options.requiredBy ?? null,
      pinnedFileId: options.pinnedFileId ?? null,
    });
    if (!existed) await resolve(key);
  }

  function restart() {
    epoch += 1;
    controller.abort();
    controller = new AbortController();
    inFlight.clear();
  }

  return {
    addMod,

    /** Re-runs resolution (and dependency expansion) for one mod. */
    retry: (key: string) => resolve(key),

    removeMods(keys: string[]) {
      store.dispatch({ type: 'removeMods', keys });
    },

    clear() {
      restart();
      store.dispatch({ type: 'clearMods' });
    },

    /** Switches profile and re-resolves every user-added mod (dependencies are rebuilt). */
    async changeProfile(profile: Profile, mode: 'revalidate' | 'clear') {
      restart();
      store.dispatch({ type: 'setProfile', profile });
      if (mode === 'clear') {
        store.dispatch({ type: 'clearMods' });
        return;
      }
      store.dispatch({ type: 'resetForRevalidation' });
      const keys = [...store.getState().order];
      await mapLimit(keys, RESOLVE_CONCURRENCY, (key) => resolve(key));
      const state = store.getState();
      const failed = keys.filter((k) => state.mods[k] && state.mods[k]!.status !== 'ready').length;
      if (failed > 0) {
        notify('warning', `${failed} mod${failed === 1 ? '' : 's'} have no compatible file for the new profile.`);
      } else if (keys.length > 0) {
        notify('info', `All ${keys.length} mods re-validated for the new profile.`);
      }
    },

    /** Retries the SHA-1 lookup that maps CurseForge files to Modrinth copies. */
    async findModrinthMatches(keys: string[]): Promise<number> {
      const mods = keys.map((k) => store.getState().mods[k]).filter((m) => m?.curseforge?.sha1 && !m.modrinth);
      const sha1s = mods.map((m) => m!.curseforge!.sha1!);
      const matches = await api.modrinthBySha1(sha1s);
      let found = 0;
      for (const mod of mods) {
        const match = matches.get(mod!.curseforge!.sha1!);
        if (match) {
          store.dispatch({ type: 'setCrossRef', key: mod!.key, modrinth: match });
          found += 1;
        }
      }
      return found;
    },

    /**
     * Downloads Modrinth jars, computes CurseForge's murmur2 fingerprint and asks
     * CurseForge whether it hosts the identical file. Matched mods become exportable
     * to a CurseForge manifest.
     */
    async findCurseForgeMatches(keys: string[], onProgress?: (done: number, total: number) => void): Promise<number> {
      const mods = keys.map((k) => store.getState().mods[k]).filter((m) => m?.modrinth && !m.curseforge);
      const fingerprints = new Map<number, string>();
      let done = 0;
      onProgress?.(0, mods.length);
      await mapLimit(mods, 3, async (mod) => {
        try {
          const bytes = await api.downloadBytes(mod!.modrinth!.url);
          fingerprints.set(curseForgeFingerprint(bytes), mod!.key);
        } catch {
          // A jar that cannot be downloaded simply stays unmatched.
        } finally {
          onProgress?.(++done, mods.length);
        }
      });
      if (fingerprints.size === 0) return 0;

      const matches = await api.curseForgeByFingerprint([...fingerprints.keys()]);
      let found = 0;
      for (const [fingerprint, key] of fingerprints) {
        const match = matches.get(fingerprint);
        if (match) {
          store.dispatch({ type: 'setCrossRef', key, curseforge: match });
          found += 1;
        }
      }
      return found;
    },
  };
}

export type PackController = ReturnType<typeof createPackController>;
