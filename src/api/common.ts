import type { Environment, SearchSort } from '../state/preferences';
import type { CurseForgeFileRef, Loader, ModSource, ModrinthFileRef, SearchHit } from '../types';

export interface SearchPage {
  hits: SearchHit[];
  total: number;
}

export interface SearchParams {
  query: string;
  gameVersion: string;
  loader: Loader;
  offset: number;
  limit: number;
  sort?: SearchSort;
  /** Modrinth only: require client- or server-side support. */
  environment?: Environment;
  signal?: AbortSignal;
}

export interface DependencyRef {
  source: ModSource;
  projectId: string;
  /** A specific file/version the parent pins, if any. */
  pinnedFileId: string | null;
}

/** Result of picking the best file for a project under the current profile. */
export interface ResolvedFile {
  versionLabel: string;
  modrinth: ModrinthFileRef | null;
  curseforge: CurseForgeFileRef | null;
  requiredDependencies: DependencyRef[];
  incompatibleProjects: DependencyRef[];
}

/** Project metadata needed to put a mod in the workspace (used for dependencies). */
export interface ProjectInfo {
  source: ModSource;
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  pageUrl: string;
}

export class NoCompatibleVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoCompatibleVersionError';
  }
}

export function modKey(source: ModSource, projectId: string | number): string {
  return `${source}:${projectId}`;
}
