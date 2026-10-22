export type ModSource = 'modrinth' | 'curseforge';
export type SourceFilter = 'all' | ModSource;
export type Loader = 'fabric' | 'quilt' | 'forge' | 'neoforge';
export type ExportFormat = 'curseforge' | 'modrinth';

export const LOADERS: readonly { id: Loader; label: string; hint: string }[] = [
  { id: 'fabric', label: 'Fabric', hint: 'Lightweight, fast-updating loader' },
  { id: 'quilt', label: 'Quilt', hint: 'Fabric fork – also runs most Fabric mods' },
  { id: 'forge', label: 'Forge', hint: 'The classic loader, strongest on older versions' },
  { id: 'neoforge', label: 'NeoForge', hint: 'Community fork of Forge for 1.20.2+' },
];

export function loaderName(loader: Loader): string {
  return LOADERS.find((l) => l.id === loader)?.label ?? loader;
}

/**
 * Loaders whose mods run under the selected loader. Quilt loads Fabric mods, so a Quilt
 * pack can use files built for either.
 */
export function compatibleLoaders(loader: Loader): Loader[] {
  return loader === 'quilt' ? ['quilt', 'fabric'] : [loader];
}

export interface Profile {
  gameVersion: string;
  loader: Loader;
}

/** Normalised search hit, regardless of which platform it came from. */
export interface SearchHit {
  key: string;
  source: ModSource;
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  pageUrl: string;
}

export type EnvRequirement = 'required' | 'optional' | 'unsupported';

/** Everything a `modrinth.index.json` file entry needs. */
export interface ModrinthFileRef {
  projectId: string;
  versionId: string;
  versionNumber: string;
  filename: string;
  sha1: string;
  sha512: string;
  url: string;
  size: number;
  env: { client: EnvRequirement; server: EnvRequirement };
}

/** Everything a CurseForge `manifest.json` file entry needs (plus display data). */
export interface CurseForgeFileRef {
  projectId: number;
  fileId: number;
  filename: string;
  displayName: string;
  size: number;
  sha1: string | null;
  downloadUrl: string | null;
}

export type PackModStatus = 'resolving' | 'ready' | 'incompatible' | 'error';

export interface PackMod {
  /** `${source}:${projectId}` – unique within the pack. */
  key: string;
  source: ModSource;
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  pageUrl: string;
  status: PackModStatus;
  error: string | null;
  versionLabel: string | null;
  /** File on Modrinth – native for Modrinth mods, a hash match for CurseForge mods. */
  modrinth: ModrinthFileRef | null;
  /** File on CurseForge – native for CurseForge mods, a fingerprint match for Modrinth mods. */
  curseforge: CurseForgeFileRef | null;
  /** True when the user added the mod themselves (not only pulled in as a dependency). */
  explicit: boolean;
  /** Keys of pack mods that require this one. */
  requiredBy: string[];
  /** Specific file/version a parent dependency pinned, honoured when it fits the profile. */
  pinnedFileId: string | null;
  /** Project keys this mod's file declares as incompatible (used for conflict detection). */
  declaredIncompatibilities: string[];
  addedAt: number;
}

export interface PackMeta {
  name: string;
  version: string;
  author: string;
  /** Short blurb shown by launchers (written as the .mrpack `summary`). */
  description: string;
}

export type ReleaseChannel = 'release' | 'beta' | 'alpha';

/** One downloadable file/version of a project, used by the details view's version picker. */
export interface VersionOption {
  /** Modrinth version id or CurseForge file id. */
  id: string;
  name: string;
  channel: ReleaseChannel;
  published: string;
  filename: string;
  size: number;
  loaders: string[];
  gameVersions: string[];
}

export type SideSupport = 'required' | 'optional' | 'unsupported' | 'unknown';

/** Rich project metadata for the details view. */
export interface ProjectDetails {
  source: ModSource;
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  pageUrl: string;
  downloads: number;
  followers: number | null;
  updated: string | null;
  categories: string[];
  license: string | null;
  links: { label: string; url: string }[];
  gallery: { url: string; title: string | null }[];
  /** Every loader and Minecraft version the project has ever published files for. */
  loaders: string[];
  gameVersions: string[];
  side: { client: SideSupport; server: SideSupport } | null;
}
