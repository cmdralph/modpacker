import JSZip from 'jszip';
import { LOADERS, type ExportFormat, type Loader, type PackMeta, type Profile } from '../types';

export type ImportEntry =
  | { source: 'modrinth'; sha1: string; path: string }
  | { source: 'curseforge'; projectId: string; fileId: string };

export interface ParsedPack {
  format: ExportFormat;
  meta: Partial<PackMeta>;
  profile: Profile;
  loaderVersion: string | null;
  entries: ImportEntry[];
  /** Files listed in the manifest that can't be matched to a mod platform (e.g. resource packs hosted elsewhere). */
  skipped: string[];
  /** The archive ships an overrides/ folder (configs etc.) that the builder does not carry over. */
  hasOverrides: boolean;
}

export class PackImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackImportError';
  }
}

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
  dependencies?: Record<string, string>;
  files?: { path?: string; hashes?: { sha1?: string } }[];
}

interface CfManifest {
  manifestType?: string;
  name?: string;
  version?: string;
  author?: string;
  minecraft?: { version?: string; modLoaders?: { id?: string; primary?: boolean }[] };
  files?: { projectID?: number; fileID?: number; required?: boolean }[];
}

function isLoader(value: string): value is Loader {
  return LOADERS.some((l) => l.id === value);
}

export function parseModrinthIndex(index: MrpackIndex, hasOverrides: boolean): ParsedPack {
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
    if (sha1 && path.startsWith('mods/')) entries.push({ source: 'modrinth', sha1, path });
    else skipped.push(path);
  }

  return {
    format: 'modrinth',
    meta: { name: index.name, version: index.versionId },
    profile: { gameVersion, loader: MRPACK_LOADER_KEYS[loaderEntry[0]]! },
    loaderVersion: loaderEntry[1] || null,
    entries,
    skipped,
    hasOverrides,
  };
}

export function parseCurseForgeManifest(manifest: CfManifest, hasOverrides: boolean): ParsedPack {
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
    if (typeof file.projectID === 'number' && typeof file.fileID === 'number') {
      entries.push({ source: 'curseforge', projectId: String(file.projectID), fileId: String(file.fileID) });
    } else {
      skipped.push(JSON.stringify(file));
    }
  }

  return {
    format: 'curseforge',
    meta: { name: manifest.name, version: manifest.version, author: manifest.author },
    profile: { gameVersion, loader },
    loaderVersion: dash > 0 ? loaderId.slice(dash + 1) : null,
    entries,
    skipped,
    hasOverrides,
  };
}

/** Reads a .mrpack or CurseForge .zip and returns its profile and mod list. */
export async function parsePackArchive(data: ArrayBuffer | Uint8Array | Blob): Promise<ParsedPack> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new PackImportError('The file is not a valid zip archive.');
  }
  const hasOverrides = Object.keys(zip.files).some((name) => /^(client-|server-)?overrides\/.+/.test(name) && !zip.files[name]!.dir);

  const readJson = async <T>(name: string): Promise<T> => {
    try {
      return JSON.parse(await zip.file(name)!.async('string')) as T;
    } catch {
      throw new PackImportError(`${name} is not valid JSON.`);
    }
  };

  if (zip.file('modrinth.index.json')) return parseModrinthIndex(await readJson<MrpackIndex>('modrinth.index.json'), hasOverrides);
  if (zip.file('manifest.json')) return parseCurseForgeManifest(await readJson<CfManifest>('manifest.json'), hasOverrides);
  throw new PackImportError('No modrinth.index.json or manifest.json found – is this a modpack?');
}
