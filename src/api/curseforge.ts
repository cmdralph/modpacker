import {
  compatibleLoaders,
  loaderName,
  type CurseForgeFileRef,
  type Loader,
  type ProjectDetails,
  type Profile,
  type ReleaseChannel,
  type SearchHit,
  type VersionOption,
} from '../types';
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
  links?: { websiteUrl?: string | null; wikiUrl?: string | null; issuesUrl?: string | null; sourceUrl?: string | null };
  logo?: { thumbnailUrl?: string | null; url?: string | null } | null;
  authors?: { name: string }[];
  categories?: { name: string }[];
  screenshots?: { title?: string | null; url: string }[];
  dateModified?: string;
  thumbsUpCount?: number;
  latestFilesIndexes?: { gameVersion: string; modLoader?: number | null }[];
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
  quilt: 5,
  neoforge: 6,
};

const LOADER_BY_TYPE: Record<number, string> = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' };

/** Loader names as they appear inside a CurseForge file's `gameVersions` array. */
const LOADER_TAG: Record<Loader, string> = {
  forge: 'Forge',
  fabric: 'Fabric',
  quilt: 'Quilt',
  neoforge: 'NeoForge',
};

const CHANNEL: Record<CfReleaseType, ReleaseChannel> = { 1: 'release', 2: 'beta', 3: 'alpha' };

/** CurseForge `ModsSearchSortField` per sort option. */
const SORT_FIELD: Record<NonNullable<SearchParams['sort']>, string> = {
  relevance: '2', // Popularity – CurseForge has no relevance sort
  follows: '2',
  downloads: '6', // TotalDownloads
  newest: '11', // ReleasedDate
  updated: '3', // LastUpdated
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
  return (
    file.gameVersions.includes(profile.gameVersion) &&
    compatibleLoaders(profile.loader).some((l) => file.gameVersions.includes(LOADER_TAG[l]))
  );
}

function isUsable(file: CfFile): boolean {
  return file.isAvailable !== false && !file.isServerPack;
}

/** Newest release first; falls back to the newest beta, then alpha. */
export function pickBestFile(files: CfFile[]): CfFile | null {
  const sorted = files.filter(isUsable).toSorted((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
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

const LOADER_TAGS = new Set(Object.values(LOADER_TAG));

export function toCfVersionOption(file: CfFile): VersionOption {
  return {
    id: String(file.id),
    name: file.displayName,
    channel: CHANNEL[file.releaseType],
    published: file.fileDate,
    filename: file.fileName,
    size: file.fileLength,
    loaders: file.gameVersions.filter((v) => LOADER_TAGS.has(v)).map((v) => v.toLowerCase()),
    gameVersions: file.gameVersions.filter((v) => /^\d+\.\d+/.test(v)),
  };
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
    // Quilt runs Fabric mods and almost all of them are only tagged "Fabric" on CurseForge.
    modLoaderType: String(MOD_LOADER_TYPE[params.loader === 'quilt' ? 'fabric' : params.loader]),
    sortField: SORT_FIELD[params.sort ?? 'relevance'],
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

export async function getCurseForgeDetails(modId: string, signal?: AbortSignal): Promise<ProjectDetails> {
  const { data: mod } = await cfFetch<{ data: CfMod }>(`/v1/mods/${encodeURIComponent(modId)}`, { signal });
  const indexes = mod.latestFilesIndexes ?? [];
  const links = [
    { label: 'CurseForge', url: pageUrl(mod) },
    mod.links?.sourceUrl && { label: 'Source', url: mod.links.sourceUrl },
    mod.links?.issuesUrl && { label: 'Issues', url: mod.links.issuesUrl },
    mod.links?.wikiUrl && { label: 'Wiki', url: mod.links.wikiUrl },
  ].filter((l): l is { label: string; url: string } => Boolean(l));

  return {
    ...toProjectInfo(mod),
    downloads: mod.downloadCount,
    followers: mod.thumbsUpCount ?? null,
    updated: mod.dateModified ?? null,
    categories: (mod.categories ?? []).map((c) => c.name),
    license: null,
    links,
    gallery: (mod.screenshots ?? []).slice(0, 6).map((s) => ({ url: s.url, title: s.title ?? null })),
    loaders: [...new Set(indexes.map((i) => LOADER_BY_TYPE[i.modLoader ?? 0]).filter((l): l is string => Boolean(l)))],
    gameVersions: [...new Set(indexes.map((i) => i.gameVersion))],
    side: null,
  };
}

export async function listCompatibleCurseForgeFiles(modId: string, profile: Profile, signal?: AbortSignal): Promise<CfFile[]> {
  const query = new URLSearchParams({ gameVersion: profile.gameVersion, pageSize: '50' });
  // Quilt profiles accept Fabric files too, so they skip the server-side loader filter.
  if (profile.loader !== 'quilt') query.set('modLoaderType', String(MOD_LOADER_TYPE[profile.loader]));
  const data = await cfFetch<{ data: CfFile[] }>(`/v1/mods/${encodeURIComponent(modId)}/files?${query}`, { signal });
  // The server-side filter is loose for multi-loader files; double-check locally.
  return data.data.filter((f) => fileMatchesProfile(f, profile));
}

export async function listCurseForgeVersionOptions(modId: string, profile: Profile, signal?: AbortSignal): Promise<VersionOption[]> {
  const files = await listCompatibleCurseForgeFiles(modId, profile, signal);
  return files
    .filter(isUsable)
    .toSorted((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate))
    .map(toCfVersionOption);
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
    throw new NoCompatibleVersionError(`No ${loaderName(profile.loader)} build for Minecraft ${profile.gameVersion} on CurseForge.`);
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
