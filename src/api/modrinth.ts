import type { EnvRequirement, Loader, ModrinthFileRef, Profile, SearchHit } from '../types';
import { fetchJson } from './http';
import {
  NoCompatibleVersionError,
  modKey,
  type DependencyRef,
  type ProjectInfo,
  type ResolvedFile,
  type SearchPage,
  type SearchParams,
} from './common';

export const MODRINTH_API = 'https://api.modrinth.com/v2';

// ---------------------------------------------------------------------------
// Raw API shapes (only the fields we use)
// ---------------------------------------------------------------------------

type SideSupport = 'required' | 'optional' | 'unsupported' | 'unknown';

interface MrSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  icon_url: string | null;
  downloads: number;
}

interface MrSearchResponse {
  hits: MrSearchHit[];
  total_hits: number;
}

interface MrProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  team: string;
  client_side: SideSupport;
  server_side: SideSupport;
}

interface MrTeamMember {
  team_id: string;
  role: string;
  user: { username: string };
}

interface MrVersionFile {
  hashes: { sha1: string; sha512: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

interface MrDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface MrVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  game_versions: string[];
  loaders: string[];
  files: MrVersionFile[];
  dependencies: MrDependency[];
}

interface MrGameVersionTag {
  version: string;
  version_type: 'release' | 'snapshot' | 'alpha' | 'beta';
  date: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const q = (value: unknown) => encodeURIComponent(JSON.stringify(value));

export function projectPageUrl(slugOrId: string): string {
  return `https://modrinth.com/mod/${slugOrId}`;
}

function toEnv(side: SideSupport): EnvRequirement {
  return side === 'unknown' ? 'required' : side;
}

/** Picks the newest release, falling back to the newest beta/alpha. Input is newest-first. */
export function pickBestVersion(versions: MrVersion[]): MrVersion | null {
  return (
    versions.find((v) => v.version_type === 'release') ??
    versions.find((v) => v.version_type === 'beta') ??
    versions[0] ??
    null
  );
}

export function toModrinthFileRef(version: MrVersion, project: Pick<MrProject, 'client_side' | 'server_side'>): ModrinthFileRef {
  const file = version.files.find((f) => f.primary) ?? version.files[0];
  if (!file) throw new NoCompatibleVersionError(`Version ${version.version_number} has no downloadable files.`);
  return {
    projectId: version.project_id,
    versionId: version.id,
    versionNumber: version.version_number,
    filename: file.filename,
    sha1: file.hashes.sha1,
    sha512: file.hashes.sha512,
    url: file.url,
    size: file.size,
    env: { client: toEnv(project.client_side), server: toEnv(project.server_side) },
  };
}

function toDependencyRefs(version: MrVersion, type: MrDependency['dependency_type']): DependencyRef[] {
  return version.dependencies
    .filter((d) => d.dependency_type === type && d.project_id)
    .map((d) => ({ source: 'modrinth' as const, projectId: d.project_id as string, pinnedFileId: d.version_id }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchModrinth(params: SearchParams): Promise<SearchPage> {
  const facets = [[`categories:${params.loader}`], [`versions:${params.gameVersion}`], ['project_type:mod']];
  const index = params.query.trim() ? 'relevance' : 'downloads';
  const url =
    `${MODRINTH_API}/search?query=${encodeURIComponent(params.query.trim())}` +
    `&facets=${q(facets)}&index=${index}&offset=${params.offset}&limit=${params.limit}`;
  const data = await fetchJson<MrSearchResponse>(url, { signal: params.signal });
  return {
    total: data.total_hits,
    hits: data.hits.map(
      (hit): SearchHit => ({
        key: modKey('modrinth', hit.project_id),
        source: 'modrinth',
        projectId: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        author: hit.author,
        iconUrl: hit.icon_url || null,
        downloads: hit.downloads,
        pageUrl: projectPageUrl(hit.slug),
      }),
    ),
  };
}

export async function getModrinthProject(projectId: string, signal?: AbortSignal): Promise<MrProject> {
  return fetchJson<MrProject>(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}`, { signal });
}

/** Loads display metadata (including the owner's username) for dependency projects. */
export async function getModrinthProjectInfos(projectIds: string[], signal?: AbortSignal): Promise<ProjectInfo[]> {
  if (projectIds.length === 0) return [];
  const projects = await fetchJson<MrProject[]>(`${MODRINTH_API}/projects?ids=${q(projectIds)}`, { signal });

  const authors = new Map<string, string>();
  try {
    const teamIds = [...new Set(projects.map((p) => p.team))];
    const teams = await fetchJson<MrTeamMember[][]>(`${MODRINTH_API}/teams?ids=${q(teamIds)}`, { signal });
    // The response is not guaranteed to follow the request order, so key by team_id.
    for (const members of teams) {
      const owner = members.find((m) => m.role.toLowerCase() === 'owner') ?? members[0];
      if (owner) authors.set(owner.team_id, owner.user.username);
    }
  } catch {
    // Author names are cosmetic; a failed team lookup must not block dependency resolution.
  }

  return projects.map((p) => ({
    source: 'modrinth',
    projectId: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    author: authors.get(p.team) ?? 'Unknown author',
    iconUrl: p.icon_url || null,
    pageUrl: projectPageUrl(p.slug),
  }));
}

export async function getModrinthVersion(versionId: string, signal?: AbortSignal): Promise<MrVersion> {
  return fetchJson<MrVersion>(`${MODRINTH_API}/version/${encodeURIComponent(versionId)}`, { signal });
}

export async function listCompatibleModrinthVersions(projectId: string, profile: Profile, signal?: AbortSignal): Promise<MrVersion[]> {
  const url =
    `${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version` +
    `?loaders=${q([profile.loader])}&game_versions=${q([profile.gameVersion])}`;
  return fetchJson<MrVersion[]>(url, { signal });
}

function versionMatchesProfile(version: MrVersion, profile: Profile): boolean {
  return version.game_versions.includes(profile.gameVersion) && version.loaders.includes(profile.loader);
}

/**
 * Finds the latest file of a Modrinth project matching the profile.
 * A dependency pinned to a specific version is honoured when that version fits the profile.
 */
export async function resolveModrinthFile(
  projectId: string,
  profile: Profile,
  pinnedVersionId: string | null,
  signal?: AbortSignal,
): Promise<ResolvedFile> {
  const project = await getModrinthProject(projectId, signal);

  let version: MrVersion | null = null;
  if (pinnedVersionId) {
    const pinned = await getModrinthVersion(pinnedVersionId, signal).catch(() => null);
    if (pinned && versionMatchesProfile(pinned, profile)) version = pinned;
  }
  if (!version) {
    version = pickBestVersion(await listCompatibleModrinthVersions(projectId, profile, signal));
  }
  if (!version) {
    throw new NoCompatibleVersionError(`No ${loaderName(profile.loader)} build for Minecraft ${profile.gameVersion} on Modrinth.`);
  }

  return {
    versionLabel: version.version_number,
    modrinth: toModrinthFileRef(version, project),
    curseforge: null,
    requiredDependencies: toDependencyRefs(version, 'required'),
    incompatibleProjects: toDependencyRefs(version, 'incompatible'),
  };
}

/**
 * Looks up files on Modrinth by SHA-1. Used to find a Modrinth copy of a CurseForge
 * file (same bytes ⇒ same hash), which lets CurseForge mods go into a `.mrpack`.
 */
export async function lookupModrinthFilesBySha1(sha1s: string[], signal?: AbortSignal): Promise<Map<string, ModrinthFileRef>> {
  const result = new Map<string, ModrinthFileRef>();
  if (sha1s.length === 0) return result;

  const versions = await fetchJson<Record<string, MrVersion>>(`${MODRINTH_API}/version_files`, {
    method: 'POST',
    body: { hashes: sha1s, algorithm: 'sha1' },
    signal,
  });
  const entries = Object.entries(versions);
  if (entries.length === 0) return result;

  const projectIds = [...new Set(entries.map(([, v]) => v.project_id))];
  const projects = await fetchJson<MrProject[]>(`${MODRINTH_API}/projects?ids=${q(projectIds)}`, { signal });
  const sides = new Map(projects.map((p) => [p.id, p]));

  for (const [sha1, version] of entries) {
    const file = version.files.find((f) => f.hashes.sha1 === sha1);
    const project = sides.get(version.project_id);
    if (!file || !project) continue;
    result.set(sha1, {
      projectId: version.project_id,
      versionId: version.id,
      versionNumber: version.version_number,
      filename: file.filename,
      sha1: file.hashes.sha1,
      sha512: file.hashes.sha512,
      url: file.url,
      size: file.size,
      env: { client: toEnv(project.client_side), server: toEnv(project.server_side) },
    });
  }
  return result;
}

export async function getMinecraftReleases(signal?: AbortSignal): Promise<string[]> {
  const tags = await fetchJson<MrGameVersionTag[]>(`${MODRINTH_API}/tag/game_version`, { signal });
  return tags
    .filter((t) => t.version_type === 'release')
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .map((t) => t.version);
}

export function loaderName(loader: Loader): string {
  return { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }[loader];
}
