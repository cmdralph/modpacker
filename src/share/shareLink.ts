import { isLoader, type ImportEntry, type ParsedPack } from '../import/parsePack';
import type { PackState } from '../state/pack';
import { orderedMods } from '../state/pack';

/**
 * Share links carry the whole pack in the URL fragment (never sent to any server):
 * `#pack=` + `z` (deflate) or `j` (plain JSON) + base64url payload.
 */
export const SHARE_PARAM = 'pack';
const MAX_ENCODED = 64 * 1024;
const MAX_DECODED = 512 * 1024;
const MAX_MODS = 2000;

/** [source (0 = Modrinth, 1 = CurseForge), project id, pinned file id or null] */
type SharedMod = [0 | 1, string, string | null];

interface SharePayload {
  v: 1;
  n: string;
  d?: string;
  g: string;
  l: string;
  lv?: string;
  m: SharedMod[];
}

export class ShareLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareLinkError';
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ShareLinkError('This share link is too large.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** Builds the fragment payload for the current pack; every mod is pinned to its current file. */
export async function encodeShare(state: PackState): Promise<string> {
  const mods: SharedMod[] = [];
  for (const mod of orderedMods(state)) {
    const file = mod.source === 'modrinth' ? mod.modrinth?.versionId : mod.curseforge ? String(mod.curseforge.fileId) : undefined;
    mods.push([mod.source === 'modrinth' ? 0 : 1, mod.projectId, file ?? mod.pinnedFileId ?? null]);
  }
  const payload: SharePayload = {
    v: 1,
    n: state.meta.name,
    ...(state.meta.description ? { d: state.meta.description } : {}),
    g: state.profile.gameVersion,
    l: state.profile.loader,
    ...(state.loaderVersion ? { lv: state.loaderVersion } : {}),
    m: mods,
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (!canCompress()) return `j${toBase64Url(json)}`;
  return `z${toBase64Url(await transform(json, new CompressionStream('deflate-raw'), Number.POSITIVE_INFINITY))}`;
}

export function shareUrl(encoded: string, base: string): string {
  return `${base.split('#')[0]}#${SHARE_PARAM}=${encoded}`;
}

const MODRINTH_ID = /^[\w-]{1,64}$/;

const str = (value: unknown, max: number) => (typeof value === 'string' && value.length <= max ? value : null);
const CURSEFORGE_ID = /^\d{1,12}$/;

/** Parses and strictly validates a payload from a (possibly hostile) link. */
export async function decodeShare(encoded: string): Promise<ParsedPack> {
  if (encoded.length > MAX_ENCODED) throw new ShareLinkError('This share link is too large.');
  const kind = encoded[0];
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(encoded.slice(1));
  } catch {
    throw new ShareLinkError('This share link is damaged.');
  }
  if (kind === 'z') {
    if (!canCompress()) throw new ShareLinkError('Your browser can’t open compressed share links.');
    try {
      bytes = await transform(bytes, new DecompressionStream('deflate-raw'), MAX_DECODED);
    } catch (error) {
      throw error instanceof ShareLinkError ? error : new ShareLinkError('This share link is damaged.');
    }
  } else if (kind !== 'j') {
    throw new ShareLinkError('This share link is damaged.');
  }

  let payload: Partial<SharePayload>;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SharePayload>;
  } catch {
    throw new ShareLinkError('This share link is damaged.');
  }

  const name = str(payload.n, 120);
  const gameVersion = str(payload.g, 32);
  const loader = str(payload.l, 16);
  if (payload.v !== 1 || !name || !gameVersion || !/^[\w.-]+$/.test(gameVersion) || !loader || !isLoader(loader) || !Array.isArray(payload.m)) {
    throw new ShareLinkError('This share link isn’t a Modpacker pack.');
  }
  if (payload.m.length > MAX_MODS) throw new ShareLinkError('This share link lists too many mods.');
  const loaderVersion = payload.lv === undefined ? null : str(payload.lv, 64);
  if (loaderVersion !== null && !/^[\w.+-]+$/.test(loaderVersion)) throw new ShareLinkError('This share link has an invalid loader version.');

  const entries: ImportEntry[] = [];
  for (const item of payload.m as unknown[]) {
    if (!Array.isArray(item) || item.length !== 3) throw new ShareLinkError('This share link has an invalid mod entry.');
    const [source, projectId, fileId] = item as [unknown, unknown, unknown];
    const idPattern = source === 0 ? MODRINTH_ID : source === 1 ? CURSEFORGE_ID : null;
    if (!idPattern || typeof projectId !== 'string' || !idPattern.test(projectId) || (fileId !== null && (typeof fileId !== 'string' || !idPattern.test(fileId)))) {
      throw new ShareLinkError('This share link has an invalid mod entry.');
    }
    entries.push({ kind: 'project', source: source === 0 ? 'modrinth' : 'curseforge', projectId, fileId: fileId as string | null });
  }

  return {
    format: 'link',
    meta: { name, description: str(payload.d, 2000) ?? undefined },
    profile: { gameVersion, loader },
    loaderVersion,
    entries,
    skipped: [],
    files: [],
  };
}

/** Reads a share payload from a location hash like `#pack=z...`. */
export function readShareHash(hash: string): string | null {
  const match = /^#?pack=([A-Za-z0-9_-]+)$/.exec(hash);
  return match?.[1] ?? null;
}
