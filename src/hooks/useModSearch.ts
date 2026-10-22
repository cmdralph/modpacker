import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchPage, SearchParams } from '../api/common';
import { searchCurseForge } from '../api/curseforge';
import { getCurseForgeAccess } from '../api/curseforgeConfig';
import { errorMessage, isAbortError } from '../api/http';
import { searchModrinth } from '../api/modrinth';
import { settingsStore } from '../state/settings';
import { useStore } from '../state/store';
import type { ModSource, Profile, SearchHit, SourceFilter } from '../types';

export const PAGE_SIZE = 20;
const SLOW_AFTER_MS = 6_000;

export type SourceStatus = 'idle' | 'loading' | 'success' | 'error' | 'disabled';

export interface SourceResult {
  status: SourceStatus;
  hits: SearchHit[];
  total: number;
  error: string | null;
  loadingMore: boolean;
}

const emptySource = (status: SourceStatus = 'idle'): SourceResult => ({
  status,
  hits: [],
  total: 0,
  error: null,
  loadingMore: false,
});

const searchers: Record<ModSource, (params: SearchParams) => Promise<SearchPage>> = {
  modrinth: searchModrinth,
  curseforge: searchCurseForge,
};

/** Alternates results from both platforms so neither dominates the first rows. */
function interleave(a: SearchHit[], b: SearchHit[]): SearchHit[] {
  const out: SearchHit[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]!);
    if (b[i]) out.push(b[i]!);
  }
  return out;
}

export function useModSearch(query: string, filter: SourceFilter, profile: Profile) {
  const settings = useStore(settingsStore, (s) => s);
  const curseForgeEnabled = useMemo(() => getCurseForgeAccess().mode !== 'disabled', [settings]);
  const [results, setResults] = useState<Record<ModSource, SourceResult>>({
    modrinth: emptySource(),
    curseforge: emptySource(),
  });
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const activeSources = useMemo<ModSource[]>(() => {
    const wanted: ModSource[] = filter === 'all' ? ['modrinth', 'curseforge'] : [filter];
    return wanted.filter((s) => s !== 'curseforge' || curseForgeEnabled);
  }, [filter, curseForgeEnabled]);

  const patch = useCallback((source: ModSource, update: Partial<SourceResult> | ((r: SourceResult) => Partial<SourceResult>)) => {
    setResults((prev) => {
      const current = prev[source];
      const next = typeof update === 'function' ? update(current) : update;
      return { ...prev, [source]: { ...current, ...next } };
    });
  }, []);

  // New search whenever the query, filter, profile or CurseForge access changes.
  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSlow(false);

    setResults({
      modrinth: emptySource(activeSources.includes('modrinth') ? 'loading' : 'idle'),
      curseforge: emptySource(
        activeSources.includes('curseforge') ? 'loading' : filter !== 'modrinth' && !curseForgeEnabled ? 'disabled' : 'idle',
      ),
    });

    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const pending = activeSources.map(async (source) => {
      try {
        const page = await searchers[source]({
          query,
          gameVersion: profile.gameVersion,
          loader: profile.loader,
          offset: 0,
          limit: PAGE_SIZE,
          signal: controller.signal,
        });
        patch(source, { status: 'success', hits: page.hits, total: page.total, error: null });
      } catch (error) {
        if (isAbortError(error)) return;
        patch(source, { status: 'error', error: errorMessage(error) });
      }
    });
    void Promise.allSettled(pending).then(() => {
      clearTimeout(slowTimer);
      if (!controller.signal.aborted) setSlow(false);
    });

    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [query, filter, profile.gameVersion, profile.loader, activeSources, curseForgeEnabled, attempt, patch]);

  const loadMore = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    for (const source of activeSources) {
      const current = results[source];
      if (current.status !== 'success' || current.loadingMore || current.hits.length >= current.total) continue;
      patch(source, { loadingMore: true });
      searchers[source]({
        query,
        gameVersion: profile.gameVersion,
        loader: profile.loader,
        offset: current.hits.length,
        limit: PAGE_SIZE,
        signal: controller.signal,
      })
        .then((page) =>
          patch(source, (r) => {
            const seen = new Set(r.hits.map((h) => h.key));
            return { hits: [...r.hits, ...page.hits.filter((h) => !seen.has(h.key))], total: page.total, loadingMore: false };
          }),
        )
        .catch((error: unknown) => {
          if (isAbortError(error)) return;
          patch(source, { loadingMore: false, error: errorMessage(error) });
        });
    }
  }, [activeSources, results, query, profile.gameVersion, profile.loader, patch]);

  const hits = useMemo(
    () =>
      filter === 'all'
        ? interleave(results.modrinth.hits, results.curseforge.hits)
        : results[filter].hits,
    [filter, results],
  );

  const loading = activeSources.some((s) => results[s].status === 'loading');
  const loadingMore = activeSources.some((s) => results[s].loadingMore);
  const hasMore = activeSources.some((s) => results[s].status === 'success' && results[s].hits.length < results[s].total);
  const allFailed = activeSources.length > 0 && activeSources.every((s) => results[s].status === 'error');

  return {
    hits,
    results,
    activeSources,
    curseForgeEnabled,
    loading,
    loadingMore,
    hasMore,
    allFailed,
    slow,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
