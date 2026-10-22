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
import type { ParsedPack } from '../import/parsePack';
import { removalSnapshot, type PackAction, type PackState } from './pack';
import type { Store } from './store';

/** Remote operations the controller depends on – injectable for tests. */
export interface PackApi {
  resolve(source: ModSource, projectId: string, profile: Profile, pinned: string | null, signal: AbortSignal): Promise<ResolvedFile>;
  projectInfos(source: ModSource, projectIds: string[], signal: AbortSignal): Promise<ProjectInfo[]>;
  modrinthBySha1(sha1s: string[], signal?: AbortSignal): Promise<Map<string, ModrinthFileRef>>;
  curseForgeByFingerprint(fingerprints: number[], signal?: AbortSignal): Promise<Map<number, CurseForgeFileRef>>;
  downloadBytes(url: string, signal?: AbortSignal): Promise<Uint8Array>;
}

interface ImportItem {
  info: ProjectInfo;
  pinnedFileId: string;
}

export interface ImportSummary {
  added: number;
  /** Files no platform lookup could identify. */
  unmatched: string[];
  /** Manifest entries that aren't mods (resource packs, shaders, …). */
  skipped: string[];
  hasOverrides: boolean;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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
  /** Mods whose inputs (e.g. pinned version) changed mid-resolution and must resolve again. */
  const rerun = new Set<string>();

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
    if (!mod) return;
    if (inFlight.has(key)) {
      rerun.add(key);
      return;
    }
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
      if (rerun.delete(key) && currentEpoch === epoch) void resolve(key);
    }
  }

  async function addMod(
    info: ProjectInfo,
    options: { explicit: boolean; requiredBy?: string | null; pinnedFileId?: string | null },
  ): Promise<void> {
    const key = modKey(info.source, info.projectId);
    const existing = store.getState().mods[key];
    store.dispatch({
      type: 'addMod',
      info,
      explicit: options.explicit,
      requiredBy: options.requiredBy ?? null,
      pinnedFileId: options.pinnedFileId ?? null,
    });
    if (!existing) {
      await resolve(key);
    } else if (options.explicit && options.pinnedFileId && existing.pinnedFileId !== options.pinnedFileId) {
      // e.g. an imported pack names an exact file for a mod already pulled in as a dependency.
      store.dispatch({ type: 'setPinned', key, pinnedFileId: options.pinnedFileId });
      await resolve(key);
    }
  }

  /** Looks up display metadata for imported entries before the current pack is touched. */
  async function collectImport(parsed: ParsedPack): Promise<{ items: ImportItem[]; unmatched: string[] }> {
    const items: ImportItem[] = [];
    const unmatched: string[] = [];
    const signal = new AbortController().signal;

    const modrinthEntries = parsed.entries.filter((e) => e.source === 'modrinth');
    if (modrinthEntries.length > 0) {
      const matches = new Map<string, ModrinthFileRef>();
      for (const chunk of chunks(modrinthEntries.map((e) => e.sha1), 200)) {
        for (const [sha1, ref] of await api.modrinthBySha1(chunk, signal)) matches.set(sha1, ref);
      }
      const infos = await fetchInfos('modrinth', [...new Set([...matches.values()].map((m) => m.projectId))], signal);
      for (const entry of modrinthEntries) {
        const match = matches.get(entry.sha1);
        const info = match && infos.get(match.projectId);
        if (match && info) items.push({ info, pinnedFileId: match.versionId });
        else unmatched.push(entry.path.replace(/^mods\//, ''));
      }
    }

    const curseforgeEntries = parsed.entries.filter((e) => e.source === 'curseforge');
    if (curseforgeEntries.length > 0) {
      const infos = await fetchInfos('curseforge', [...new Set(curseforgeEntries.map((e) => e.projectId))], signal);
      for (const entry of curseforgeEntries) {
        const info = infos.get(entry.projectId);
        if (info) items.push({ info, pinnedFileId: entry.fileId });
        else unmatched.push(`CurseForge project ${entry.projectId}`);
      }
    }
    return { items, unmatched };
  }

  async function fetchInfos(source: ModSource, ids: string[], signal: AbortSignal): Promise<Map<string, ProjectInfo>> {
    const infos = new Map<string, ProjectInfo>();
    for (const chunk of chunks(ids, 100)) {
      for (const info of await api.projectInfos(source, chunk, signal)) infos.set(info.projectId, info);
    }
    return infos;
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

    /** Removes mods (and orphaned dependencies). Returns an undo function. */
    removeMods(keys: string[]): () => void {
      const before = store.getState();
      store.dispatch({ type: 'removeMods', keys });
      const snapshot = removalSnapshot(before, store.getState());
      return () => store.dispatch({ type: 'restoreMods', snapshot });
    },

    /** Pins a specific file/version (null = always use the latest compatible one) and re-resolves. */
    async setVersion(key: string, fileId: string | null) {
      if (!store.getState().mods[key]) return;
      store.dispatch({ type: 'setPinned', key, pinnedFileId: fileId });
      await resolve(key);
    },

    /**
     * Replaces the workspace with an imported pack: profile, loader build, metadata and every mod
     * pinned to the exact file the pack used. Throws before touching the pack if lookups fail.
     */
    async importPack(parsed: ParsedPack): Promise<ImportSummary> {
      const { items, unmatched } = await collectImport(parsed);
      restart();
      store.dispatch({ type: 'setProfile', profile: parsed.profile });
      store.dispatch({ type: 'clearMods' });
      store.dispatch({ type: 'setLoaderVersion', version: parsed.loaderVersion });
      const meta = Object.fromEntries(Object.entries(parsed.meta).filter(([, v]) => typeof v === 'string' && v.trim()));
      store.dispatch({ type: 'setMeta', patch: meta });
      await mapLimit(items, RESOLVE_CONCURRENCY, (item) => addMod(item.info, { explicit: true, pinnedFileId: item.pinnedFileId }));
      return { added: items.length, unmatched, skipped: parsed.skipped, hasOverrides: parsed.hasOverrides };
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
