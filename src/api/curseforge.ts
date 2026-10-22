import type { CurseForgeFileRef, Loader, Profile, SearchHit } from '../types';
import { ApiError, fetchJson, type RequestOptions } from './http';
import { MINECRAFT_GAME_ID, MODS_CLASS_ID, getCurseForgeAccess } from './curseforgeConfig';
import {
  NoCompatibleVersionError,
  modKey,
  type DependencyRef,
  type ProjectInfo,
  type ResolvedFile,
  type SearchPage,
  type SearchParams,
} from './common';

// ---------------------------------------------------------------------------
// Raw API shapes (only the fields we use)
// ---------------------------------------------------------------------------

interface CfMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  links?: { websiteUrl?: string | null };
  logo?: { thumbnailUrl?: string | null; url?: string | null } | null;
  authors?: { name: string }[];
}

/** 1 = Release, 2 = Beta, 3 = Alpha */
type CfReleaseType = 1 | 2 | 3;

/** 3 = RequiredDependency, 5 = Incompatible (others are optional/embedded/tool/include). */
interface CfFileDependency {
  modId: number;
  relationType: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface CfFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: CfReleaseType;
  fileDate: string;
  fileLength: number;
  downloadUrl: string | null;
  isAvailable?: boolean;
  isServerPack?: boolean;
  gameVersions: string[];
  hashes: { value: string; algo: 1 | 2 }[];
  dependencies: CfFileDependency[];
  fileFingerprint: number;
}

interface CfPagination {
  index: number;
  pageSize: number;
  resultCount: number;
  totalCount: number;
}

interface CfFingerprintMatch {
  id: number;
  file: CfFile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** CurseForge `ModLoaderType` enum values. */
export const MOD_LOADER_TYPE: Record<Loader, number> = {
  forge: 1,
  fabric: 4,
  neoforge: 6,
};

/** Loader names as they appear inside a CurseForge file's `gameVersions` array. */
const LOADER_TAG: Record<Loader, string> = {
  forge: 'Forge',
  fabric: 'Fabric',
  neoforge: 'NeoForge',
};

/** CurseForge caps `index + pageSize` at 10 000. */
export const CURSEFORGE_MAX_RESULTS = 10_000;

async function cfFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const access = getCurseForgeAccess();
  if (access.mode === 'disabled') {
    throw new ApiError('config', 'CurseForge is not configured. Add an API key or proxy URL in Settings.');
  }
  try {
    return await fetchJson<T>(`${access.baseUrl}${path}`, {
      ...options,
      headers: { ...access.headers, ...options.headers },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw new ApiError('http', 'CurseForge rejected the request (403). Check your API key or proxy.', 403);
    }
    throw error;
  }
}

function pageUrl(mod: CfMod): string {
  return mod.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`;
}

function toProjectInfo(mod: CfMod): ProjectInfo {
  return {
    source: 'curseforge',
    projectId: String(mod.id),
    slug: mod.slug,
    title: mod.name,
    description: mod.summary,
    author: mod.authors?.[0]?.name ?? 'Unknown author',
    iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || null,
    pageUrl: pageUrl(mod),
  };
}

export function sha1Of(file: CfFile): string | null {
  return file.hashes.find((h) => h.algo === 1)?.value.toLowerCase() ?? null;
}

export function toCurseForgeFileRef(file: CfFile): CurseForgeFileRef {
  return {
    projectId: file.modId,
    fileId: file.id,
    filename: file.fileName,
    displayName: file.displayName,
    size: file.fileLength,
    sha1: sha1Of(file),
    downloadUrl: file.downloadUrl,
  };
}

function fileMatchesProfile(file: CfFile, profile: Profile): boolean {
  return file.gameVersions.includes(profile.gameVersion) && file.gameVersions.includes(LOADER_TAG[profile.loader]);
}

function isUsable(file: CfFile): boolean {
  return file.isAvailable !== false && !file.isServerPack;
}

/** Newest release first; falls back to the newest beta, then alpha. */
export function pickBestFile(files: CfFile[]): CfFile | null {
  const sorted = files.filter(isUsable).sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
  return (
    sorted.find((f) => f.releaseType === 1) ??
    sorted.find((f) => f.releaseType === 2) ??
    sorted[0] ??
    null
  );
}

function dependencyRefs(file: CfFile, relationType: CfFileDependency['relationType']): DependencyRef[] {
  return file.dependencies
    .filter((d) => d.relationType === relationType)
    .map((d) => ({ source: 'curseforge' as const, projectId: String(d.modId), pinnedFileId: null }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchCurseForge(params: SearchParams): Promise<SearchPage> {
  const pageSize = Math.min(params.limit, 50, Math.max(0, CURSEFORGE_MAX_RESULTS - params.offset));
  if (pageSize === 0) return { hits: [], total: params.offset };

  const query = new URLSearchParams({
    gameId: String(MINECRAFT_GAME_ID),
    classId: String(MODS_CLASS_ID),
    searchFilter: params.query.trim(),
    gameVersion: params.gameVersion,
    modLoaderType: String(MOD_LOADER_TYPE[params.loader]),
    sortField: '2', // Popularity
    sortOrder: 'desc',
    index: String(params.offset),
    pageSize: String(pageSize),
  });
  const data = await cfFetch<{ data: CfMod[]; pagination: CfPagination }>(`/v1/mods/search?${query}`, {
    signal: params.signal,
  });
  return {
    total: Math.min(data.pagination.totalCount, CURSEFORGE_MAX_RESULTS),
    hits: data.data.map((mod): SearchHit => {
      const info = toProjectInfo(mod);
      return { ...info, key: modKey('curseforge', mod.id), downloads: mod.downloadCount };
    }),
  };
}

export async function getCurseForgeProjectInfos(modIds: string[], signal?: AbortSignal): Promise<ProjectInfo[]> {
  if (modIds.length === 0) return [];
  const data = await cfFetch<{ data: CfMod[] }>('/v1/mods', {
    method: 'POST',
    body: { modIds: modIds.map(Number), filterPcOnly: true },
    signal,
  });
  return data.data.map(toProjectInfo);
}

export async function listCompatibleCurseForgeFiles(modId: string, profile: Profile, signal?: AbortSignal): Promise<CfFile[]> {
  const query = new URLSearchParams({
    gameVersion: profile.gameVersion,
    modLoaderType: String(MOD_LOADER_TYPE[profile.loader]),
    pageSize: '50',
  });
  const data = await cfFetch<{ data: CfFile[] }>(`/v1/mods/${encodeURIComponent(modId)}/files?${query}`, { signal });
  // The server-side filter is loose for multi-loader files; double-check locally.
  return data.data.filter((f) => fileMatchesProfile(f, profile));
}

export async function getCurseForgeFile(modId: string, fileId: string, signal?: AbortSignal): Promise<CfFile> {
  const data = await cfFetch<{ data: CfFile }>(
    `/v1/mods/${encodeURIComponent(modId)}/files/${encodeURIComponent(fileId)}`,
    { signal },
  );
  return data.data;
}

export async function resolveCurseForgeFile(
  modId: string,
  profile: Profile,
  pinnedFileId: string | null,
  signal?: AbortSignal,
): Promise<ResolvedFile> {
  let file: CfFile | null = null;
  if (pinnedFileId) {
    const pinned = await getCurseForgeFile(modId, pinnedFileId, signal).catch(() => null);
    if (pinned && isUsable(pinned) && fileMatchesProfile(pinned, profile)) file = pinned;
  }
  if (!file) {
    file = pickBestFile(await listCompatibleCurseForgeFiles(modId, profile, signal));
  }
  if (!file) {
    throw new NoCompatibleVersionError(
      `No ${LOADER_TAG[profile.loader]} build for Minecraft ${profile.gameVersion} on CurseForge.`,
    );
  }
  return {
    versionLabel: file.displayName,
    modrinth: null,
    curseforge: toCurseForgeFileRef(file),
    requiredDependencies: dependencyRefs(file, 3),
    incompatibleProjects: dependencyRefs(file, 5),
  };
}

/** Matches CurseForge murmur2 fingerprints to exact CurseForge files. */
export async function matchCurseForgeFingerprints(
  fingerprints: number[],
  signal?: AbortSignal,
): Promise<Map<number, CurseForgeFileRef>> {
  const result = new Map<number, CurseForgeFileRef>();
  if (fingerprints.length === 0) return result;
  const data = await cfFetch<{ data: { exactMatches: CfFingerprintMatch[] } }>(
    `/v1/fingerprints/${MINECRAFT_GAME_ID}`,
    { method: 'POST', body: { fingerprints }, signal },
  );
  for (const match of data.data.exactMatches) {
    result.set(match.file.fileFingerprint, toCurseForgeFileRef(match.file));
  }
  return result;
}
