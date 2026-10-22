import { useEffect, useState } from 'react';
import { isAbortError } from '../api/http';
import { fetchLatestLoaderVersion } from '../api/loaders';
import { getMinecraftReleases } from '../api/modrinth';
import type { Loader } from '../types';

/** Used when the Modrinth tag endpoint is unreachable. */
export const FALLBACK_GAME_VERSIONS = [
  '1.21.10', '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.1', '1.21',
  '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.12.2',
];

export function useGameVersions(): { versions: string[]; fromFallback: boolean } {
  const [state, setState] = useState({ versions: FALLBACK_GAME_VERSIONS, fromFallback: true });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const versions = await getMinecraftReleases(controller.signal);
        if (versions.length > 0) setState({ versions, fromFallback: false });
      } catch {
        // Keep the built-in list.
      }
    })();
    return () => controller.abort();
  }, []);
  return state;
}

export type LoaderVersionStatus = 'loading' | 'found' | 'missing';

/** Latest loader build for the profile; `missing` means the user must type it in. */
export function useLatestLoaderVersion(loader: Loader, gameVersion: string) {
  const key = `${loader}@${gameVersion}`;
  const [state, setState] = useState<{ key: string; version: string | null; status: LoaderVersionStatus } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const version = await fetchLatestLoaderVersion(loader, gameVersion, controller.signal);
        setState({ key, version, status: version ? 'found' : 'missing' });
      } catch (error) {
        if (!isAbortError(error) && !controller.signal.aborted) setState({ key, version: null, status: 'missing' });
      }
    })();
    return () => controller.abort();
  }, [key, loader, gameVersion]);

  // Results for a previous profile are ignored, so a profile switch reads as "loading" immediately.
  return state?.key === key ? state : { key, version: null, status: 'loading' as const };
}
