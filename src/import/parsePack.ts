import type JSZipType from 'jszip';
import { sanitizeRelativePath } from '../lib/paths';
import { loadJSZip } from '../lib/zip';
import type { OverrideRoot, PackFile } from '../state/files';
import { LOADERS, type ExportFormat, type Loader, type ModSource, type PackMeta, type Profile } from '../types';

export type ImportEntry =
  /** A file identified by hash (.mrpack) – looked up on Modrinth. */
  | { kind: 'sha1'; sha1: string; path: string }
  /** A project plus, optionally, the exact file/version to pin (CurseForge manifests, share links). */
  | { kind: 'project'; source: ModSource; projectId: string; fileId: string | null };

export interface ParsedPack {
  format: ExportFormat | 'link';
  meta: Partial<PackMeta>;
  profile: Profile;
  loaderVersion: string | null;
  entries: ImportEntry[];
  /** Files listed in the manifest that aren't mods (resource packs, shaders hosted elsewhere, …). */
  skipped: string[];
  /** Configs and other bundled files from the archive's override folders. */
  files: PackFile[];
}

export class PackImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackImportError';
  }
}

/** Refuse to unpack absurdly large override folders into memory. */
export const MAX_OVERRIDE_BYTES = 512 * 1024 * 1024;

const MRPACK_LOADER_KEYS: Record<string, Loader> = {
  'fabric-loader': 'fabric',
  'quilt-loader': 'quilt',
  forge: 'forge',
  neoforge: 'neoforge',
};

interface MrpackIndex {
  formatVersion?: number;
  name?: string;
  versionId?: string;
  summary?: string;
  dependencies?: Record<string, string>;
  files?: { path?: string; hashes?: { sha1?: string } }[];
}

interface CfManifest {
  manifestType?: string;
  name?: string;
  version?: string;
  author?: string;
  overrides?: string;
  minecraft?: { version?: string; modLoaders?: { id?: string; primary?: boolean }[] };
  files?: { projectID?: number; fileID?: number; required?: boolean }[];
}

export function isLoader(value: string): value is Loader {
  return LOADERS.some((l) => l.id === value);
}

export function parseModrinthIndex(index: MrpackIndex, files: PackFile[] = []): ParsedPack {
  if (index.formatVersion !== 1) throw new PackImportError('Unsupported modrinth.index.json format version.');
  const deps = index.dependencies ?? {};
  const gameVersion = deps.minecraft;
  if (!gameVersion) throw new PackImportError('The pack does not declare a Minecraft version.');

  const loaderEntry = Object.entries(deps).find(([key]) => key in MRPACK_LOADER_KEYS);
  if (!loaderEntry) throw new PackImportError('The pack uses a mod loader Modpacker does not support.');

  const entries: ImportEntry[] = [];
  const skipped: string[] = [];
  for (const file of index.files ?? []) {
    const sha1 = file.hashes?.sha1?.toLowerCase();
    const path = file.path ?? 'unknown file';
    // Only mods are imported; resource packs and shader packs live outside mods/.
    if (sha1 && /^[0-9a-f]{40}$/.test(sha1) && path.startsWith('mods/')) entries.push({ kind: 'sha1', sha1, path });
    else skipped.push(path);
  }

  return {
    format: 'modrinth',
    meta: { name: index.name, version: index.versionId, description: index.summary },
    profile: { gameVersion, loader: MRPACK_LOADER_KEYS[loaderEntry[0]]! },
    loaderVersion: loaderEntry[1] || null,
    entries,
    skipped,
    files,
  };
}

export function parseCurseForgeManifest(manifest: CfManifest, files: PackFile[] = []): ParsedPack {
  if (manifest.manifestType !== 'minecraftModpack') throw new PackImportError('manifest.json is not a CurseForge modpack manifest.');
  const gameVersion = manifest.minecraft?.version;
  if (!gameVersion) throw new PackImportError('The pack does not declare a Minecraft version.');

  const loaders = manifest.minecraft?.modLoaders ?? [];
  const loaderId = (loaders.find((l) => l.primary) ?? loaders[0])?.id ?? '';
  const dash = loaderId.indexOf('-');
  const loader = dash > 0 ? loaderId.slice(0, dash) : loaderId;
  if (!isLoader(loader)) throw new PackImportError(`Unsupported mod loader “${loaderId || 'none'}”.`);

  const entries: ImportEntry[] = [];
  const skipped: string[] = [];
  for (const file of manifest.files ?? []) {
    if (Number.isSafeInteger(file.projectID) && Number.isSafeInteger(file.fileID)) {
      entries.push({ kind: 'project', source: 'curseforge', projectId: String(file.projectID), fileId: String(file.fileID) });
    } else {
      skipped.push(JSON.stringify(file).slice(0, 80));
    }
  }

  return {
    format: 'curseforge',
    meta: { name: manifest.name, version: manifest.version, author: manifest.author },
    profile: { gameVersion, loader },
    loaderVersion: dash > 0 ? loaderId.slice(dash + 1) : null,
    entries,
    skipped,
    files,
  };
}

/** Pulls configs etc. out of the archive's override folders, with path checks and a size cap. */
async function extractOverrides(zip: JSZipType, overridesDir: string): Promise<{ files: PackFile[]; rejected: string[] }> {
  const roots: Record<string, OverrideRoot> = { [overridesDir]: 'overrides', 'client-overrides': 'client-overrides', 'server-overrides': 'server-overrides' };
  const files: PackFile[] = [];
  const rejected: string[] = [];
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const slash = entry.name.indexOf('/');
    const root = slash > 0 ? roots[entry.name.slice(0, slash)] : undefined;
    if (!root) continue;
    const path = sanitizeRelativePath(entry.name.slice(slash + 1));
    if (!path) {
      rejected.push(entry.name);
      continue;
    }
    const data = await entry.async('blob');
    total += data.size;
    if (total > MAX_OVERRIDE_BYTES) throw new PackImportError('The pack’s bundled files are larger than 512 MB.');
    files.push({ root, path, size: data.size, data });
  }
  return { files, rejected };
}

/** Reads a .mrpack or CurseForge .zip and returns its profile, mod list and bundled files. */
export async function parsePackArchive(data: ArrayBuffer | Uint8Array | Blob): Promise<ParsedPack> {
  const JSZip = await loadJSZip();
  let zip: JSZipType;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new PackImportError('The file is not a valid zip archive.');
  }

  const readJson = async <T>(name: string): Promise<T> => {
    try {
      return JSON.parse(await zip.file(name)!.async('string')) as T;
    } catch {
      throw new PackImportError(`${name} is not valid JSON.`);
    }
  };

  if (zip.file('modrinth.index.json')) {
    const index = await readJson<MrpackIndex>('modrinth.index.json');
    const { files, rejected } = await extractOverrides(zip, 'overrides');
    const pack = parseModrinthIndex(index, files);
    return { ...pack, skipped: [...pack.skipped, ...rejected] };
  }
  if (zip.file('manifest.json')) {
    const manifest = await readJson<CfManifest>('manifest.json');
    const dir = typeof manifest.overrides === 'string' && sanitizeRelativePath(manifest.overrides) ? manifest.overrides : 'overrides';
    const { files, rejected } = await extractOverrides(zip, dir);
    const pack = parseCurseForgeManifest(manifest, files);
    return { ...pack, skipped: [...pack.skipped, ...rejected] };
  }
  throw new PackImportError('No modrinth.index.json or manifest.json found – is this a modpack?');
}
