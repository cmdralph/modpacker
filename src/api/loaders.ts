import type { Loader } from '../types';
import { fetchJson } from './http';

interface FabricLoaderEntry {
  loader: { version: string; stable: boolean };
}

interface QuiltLoaderEntry {
  version: string;
}

interface NeoForgeVersions {
  versions: string[];
}

interface ForgePromotions {
  promos: Record<string, string>;
}

/**
 * NeoForge versions are derived from the Minecraft version: MC 1.21.1 → 21.1.x, MC 1.21 → 21.0.x,
 * MC 26.1 → 26.1.x. Returns null where NeoForge does not use this scheme (e.g. 1.20.1).
 */
export function neoForgePrefix(gameVersion: string): string | null {
  // Year-based Minecraft versions (26.1, 26.1.2, …) are used verbatim as the NeoForge prefix.
  if (/^(?:2\d|[3-9]\d)\.\d+(?:\.\d+)?$/.test(gameVersion)) return `${gameVersion}.`;
  const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(gameVersion);
  if (!match) return null;
  const major = Number(match[1]);
  if (major < 20 || gameVersion === '1.20.1') return null;
  return `${major}.${match[2] ?? '0'}.`;
}

/** Picks the newest stable NeoForge build for a game version from the maven version list (oldest-first). */
export function pickNeoForgeVersion(versions: string[], gameVersion: string): string | null {
  const prefix = neoForgePrefix(gameVersion);
  if (!prefix) return null;
  const matching = versions.filter((v) => v.startsWith(prefix));
  const stable = matching.filter((v) => !/beta|alpha|rc/i.test(v));
  return stable.at(-1) ?? matching.at(-1) ?? null;
}

async function latestFabric(gameVersion: string, signal?: AbortSignal): Promise<string | null> {
  const entries = await fetchJson<FabricLoaderEntry[]>(
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(gameVersion)}`,
    { signal },
  );
  return (entries.find((e) => e.loader.stable) ?? entries[0])?.loader.version ?? null;
}

/** Quilt's meta lists loader builds newest first; skip betas and pre-releases. */
export function pickQuiltVersion(entries: QuiltLoaderEntry[]): string | null {
  return (entries.find((e) => !/beta|pre|rc/i.test(e.version)) ?? entries[0])?.version ?? null;
}

async function latestQuilt(signal?: AbortSignal): Promise<string | null> {
  return pickQuiltVersion(await fetchJson<QuiltLoaderEntry[]>('https://meta.quiltmc.org/v3/versions/loader', { signal }));
}

async function latestNeoForge(gameVersion: string, signal?: AbortSignal): Promise<string | null> {
  const data = await fetchJson<NeoForgeVersions>(
    'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
    { signal },
  );
  return pickNeoForgeVersion(data.versions, gameVersion);
}

async function latestForge(gameVersion: string, signal?: AbortSignal): Promise<string | null> {
  const data = await fetchJson<ForgePromotions>(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
    { signal },
  );
  return data.promos[`${gameVersion}-recommended`] ?? data.promos[`${gameVersion}-latest`] ?? null;
}

/**
 * Looks up the newest loader build for a Minecraft version. Both pack formats need a concrete
 * loader version (`fabric-0.16.5` in CurseForge manifests, `"fabric-loader": "0.16.5"` in
 * Modrinth indexes). Some loader metadata hosts do not send CORS headers, so callers must
 * treat `null`/errors as "ask the user to type it in".
 */
export async function fetchLatestLoaderVersion(loader: Loader, gameVersion: string, signal?: AbortSignal): Promise<string | null> {
  switch (loader) {
    case 'fabric':
      return latestFabric(gameVersion, signal);
    case 'quilt':
      return latestQuilt(signal);
    case 'neoforge':
      return latestNeoForge(gameVersion, signal);
    case 'forge':
      return latestForge(gameVersion, signal);
  }
}
