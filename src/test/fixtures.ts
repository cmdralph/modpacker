import type { ProjectInfo } from '../api/common';
import { initialPackState, packReducer, type PackAction, type PackState } from '../state/pack';
import type { CurseForgeFileRef, ModSource, ModrinthFileRef } from '../types';

/** Deterministic 40-character hex string standing in for a SHA-1. */
export function fakeSha1(seed: string): string {
  let h = 0x811c9dc5;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(5);
}

export function projectInfo(source: ModSource, projectId: string, title = projectId): ProjectInfo {
  return {
    source,
    projectId,
    slug: title.toLowerCase(),
    title,
    description: `${title} description`,
    author: 'author',
    iconUrl: null,
    pageUrl: `https://example.com/${projectId}`,
  };
}

export function modrinthFile(projectId: string, overrides: Partial<ModrinthFileRef> = {}): ModrinthFileRef {
  return {
    projectId,
    versionId: `${projectId}-v1`,
    versionNumber: '1.0.0',
    filename: `${projectId}-1.0.0.jar`,
    sha1: fakeSha1(projectId),
    sha512: `sha512-${projectId}`,
    url: `https://cdn.modrinth.com/data/${projectId}/versions/v1/${projectId}-1.0.0.jar`,
    size: 1024,
    env: { client: 'required', server: 'required' },
    ...overrides,
  };
}

export function curseForgeFile(projectId: number, overrides: Partial<CurseForgeFileRef> = {}): CurseForgeFileRef {
  return {
    projectId,
    fileId: projectId * 10,
    filename: `cf-${projectId}.jar`,
    displayName: `CF ${projectId}`,
    size: 2048,
    sha1: `cfsha1-${projectId}`,
    downloadUrl: `https://edge.forgecdn.net/files/${projectId}/cf-${projectId}.jar`,
    ...overrides,
  };
}

export function applyActions(actions: PackAction[], state: PackState = initialPackState()): PackState {
  return actions.reduce(packReducer, state);
}

/** Builds a pack with resolved mods. */
export function packWith(
  mods: Array<{ info: ProjectInfo; modrinth?: ModrinthFileRef | null; curseforge?: CurseForgeFileRef | null; status?: 'ready' | 'incompatible' | 'error' }>,
): PackState {
  const actions: PackAction[] = [];
  for (const m of mods) {
    const key = `${m.info.source}:${m.info.projectId}`;
    actions.push({ type: 'addMod', info: m.info, explicit: true, requiredBy: null, pinnedFileId: null });
    if (!m.status || m.status === 'ready') {
      actions.push({
        type: 'modResolved',
        key,
        versionLabel: '1.0.0',
        modrinth: m.modrinth ?? null,
        curseforge: m.curseforge ?? null,
        declaredIncompatibilities: [],
      });
    } else {
      actions.push({ type: 'modFailed', key, status: m.status, error: 'nope' });
    }
  }
  return applyActions(actions);
}
