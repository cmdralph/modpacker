import type { CurseForgeFileRef, Loader, ModrinthFileRef, PackMeta, Profile } from '../types';

// ---------------------------------------------------------------------------
// CurseForge manifest.json
// ---------------------------------------------------------------------------

export interface CurseForgeManifest {
  minecraft: {
    version: string;
    modLoaders: { id: string; primary: boolean }[];
  };
  manifestType: 'minecraftModpack';
  manifestVersion: 1;
  name: string;
  version: string;
  author: string;
  files: { projectID: number; fileID: number; required: boolean }[];
  overrides: 'overrides';
}

/** CurseForge loader ids carry the loader build, e.g. `fabric-0.16.5`, `forge-47.3.0`, `neoforge-21.1.77`. */
export function curseForgeLoaderId(loader: Loader, loaderVersion: string): string {
  return `${loader}-${loaderVersion}`;
}

export function buildCurseForgeManifest(input: {
  meta: PackMeta;
  profile: Profile;
  loaderVersion: string;
  files: CurseForgeFileRef[];
}): CurseForgeManifest {
  const seen = new Set<number>();
  const files: CurseForgeManifest['files'] = [];
  for (const file of input.files) {
    if (seen.has(file.projectId)) continue;
    seen.add(file.projectId);
    files.push({ projectID: file.projectId, fileID: file.fileId, required: true });
  }

  return {
    minecraft: {
      version: input.profile.gameVersion,
      modLoaders: [{ id: curseForgeLoaderId(input.profile.loader, input.loaderVersion), primary: true }],
    },
    manifestType: 'minecraftModpack',
    manifestVersion: 1,
    name: input.meta.name,
    version: input.meta.version,
    author: input.meta.author,
    files,
    overrides: 'overrides',
  };
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The `modlist.html` CurseForge's own exporter places next to the manifest. */
export function buildCurseForgeModList(entries: { title: string; pageUrl: string; author: string }[]): string {
  const items = entries
    .map((e) => `<li><a href="${escapeHtml(e.pageUrl)}">${escapeHtml(e.title)} (by ${escapeHtml(e.author)})</a></li>`)
    .join('\n');
  return `<ul>\n${items}\n</ul>\n`;
}

// ---------------------------------------------------------------------------
// Modrinth modrinth.index.json (format version 1)
// ---------------------------------------------------------------------------

export interface ModrinthIndexFile {
  path: string;
  hashes: { sha1: string; sha512: string };
  env: { client: string; server: string };
  downloads: string[];
  fileSize: number;
}

export interface ModrinthIndex {
  formatVersion: 1;
  game: 'minecraft';
  versionId: string;
  name: string;
  summary?: string;
  files: ModrinthIndexFile[];
  dependencies: Record<string, string>;
}

/** Dependency keys defined by the .mrpack spec. */
export const MRPACK_LOADER_KEY: Record<Loader, string> = {
  fabric: 'fabric-loader',
  forge: 'forge',
  neoforge: 'neoforge',
};

/** Keeps `mods/<filename>` paths unique when two different files share a name. */
function uniquePath(filename: string, used: Set<string>): string {
  let path = `mods/${filename}`;
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  for (let n = 2; used.has(path); n++) path = `mods/${stem}-${n}${ext}`;
  used.add(path);
  return path;
}

export function buildModrinthIndex(input: {
  meta: PackMeta;
  profile: Profile;
  loaderVersion: string;
  files: ModrinthFileRef[];
  summary?: string;
}): ModrinthIndex {
  const usedPaths = new Set<string>();
  const seenHashes = new Set<string>();
  const files: ModrinthIndexFile[] = [];
  for (const file of input.files) {
    if (seenHashes.has(file.sha1)) continue;
    seenHashes.add(file.sha1);
    files.push({
      path: uniquePath(file.filename, usedPaths),
      hashes: { sha1: file.sha1, sha512: file.sha512 },
      env: { client: file.env.client, server: file.env.server },
      downloads: [file.url],
      fileSize: file.size,
    });
  }

  return {
    formatVersion: 1,
    game: 'minecraft',
    versionId: input.meta.version,
    name: input.meta.name,
    ...(input.summary ? { summary: input.summary } : {}),
    files,
    dependencies: {
      minecraft: input.profile.gameVersion,
      [MRPACK_LOADER_KEY[input.profile.loader]]: input.loaderVersion,
    },
  };
}
