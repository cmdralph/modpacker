export type ModSource = 'modrinth' | 'curseforge';
export type SourceFilter = 'all' | ModSource;
export type Loader = 'fabric' | 'forge' | 'neoforge';
export type ExportFormat = 'curseforge' | 'modrinth';

export const LOADERS: readonly { id: Loader; label: string }[] = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
];

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
}
