import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchPage, SearchParams } from '../api/common';
import { searchCurseForge } from '../api/curseforge';
import { getCurseForgeAccess } from '../api/curseforgeConfig';
import { errorMessage, isAbortError } from '../api/http';
import { searchModrinth } from '../api/modrinth';
import type { Environment, SearchSort } from '../state/preferences';
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

type Results = Record<ModSource, SourceResult>;

interface SearchState {
  /** Identifies the request these results belong to; results for any other key are stale. */
  key: string;
  results: Results;
  slow: boolean;
}

const emptySource = (status: SourceStatus = 'idle'): SourceResult => ({ status, hits: [], total: 0, error: null, loadingMore: false });

const searchers: Record<ModSource, (params: SearchParams) => Promise<SearchPage>> = {
  modrinth: searchModrinth,
  curseforge: searchCurseForge,
};

/** Alternates results from both platforms so neither dominates the first rows. */
export function interleave(a: SearchHit[], b: SearchHit[]): SearchHit[] {
  const out: SearchHit[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]!);
    if (b[i]) out.push(b[i]!);
  }
  return out;
}

function initialState(key: string, active: ModSource[], curseForgeDisabled: boolean): SearchState {
  return {
    key,
    slow: false,
    results: {
      modrinth: emptySource(active.includes('modrinth') ? 'loading' : 'idle'),
      curseforge: emptySource(active.includes('curseforge') ? 'loading' : curseForgeDisabled ? 'disabled' : 'idle'),
    },
  };
}

export function useModSearch(query: string, filter: SourceFilter, profile: Profile, sort: SearchSort, environment: Environment) {
  const curseForgeEnabled = useStore(settingsStore, () => getCurseForgeAccess().mode !== 'disabled');
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const activeSources = useMemo<ModSource[]>(() => {
    const wanted: ModSource[] = filter === 'all' ? ['modrinth', 'curseforge'] : [filter];
    return wanted.filter((s) => s !== 'curseforge' || curseForgeEnabled);
  }, [filter, curseForgeEnabled]);

  const params = useMemo(
    () => ({ query, gameVersion: profile.gameVersion, loader: profile.loader, sort, environment }),
    [query, profile.gameVersion, profile.loader, sort, environment],
  );
  const key = JSON.stringify([params, activeSources, attempt]);
  const cfDisabledHere = filter !== 'modrinth' && !curseForgeEnabled;

  const [state, setState] = useState<SearchState>(() => initialState(key, activeSources, cfDisabledHere));
  // A new request key means fresh "loading" results – derived here instead of reset in an effect.
  const current = state.key === key ? state : initialState(key, activeSources, cfDisabledHere);

  /** Applies an update only if it still belongs to request `forKey`. */
  const update = useCallback(
    (forKey: string, source: ModSource, patch: (r: SourceResult) => Partial<SourceResult>) => {
      setState((prev) => {
        const base = prev.key === forKey ? prev : initialState(forKey, activeSources, cfDisabledHere);
        return { ...base, results: { ...base.results, [source]: { ...base.results[source], ...patch(base.results[source]) } } };
      });
    },
    [activeSources, cfDisabledHere],
  );

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const slowTimer = setTimeout(() => setState((prev) => (prev.key === key ? { ...prev, slow: true } : prev)), SLOW_AFTER_MS);

    const runs = activeSources.map(async (source) => {
      try {
        const page = await searchers[source]({ ...params, offset: 0, limit: PAGE_SIZE, signal: controller.signal });
        update(key, source, () => ({ status: 'success', hits: page.hits, total: page.total, error: null }));
      } catch (error) {
        if (!isAbortError(error)) update(key, source, () => ({ status: 'error', error: errorMessage(error) }));
      }
    });
    void Promise.allSettled(runs).then(() => {
      clearTimeout(slowTimer);
      setState((prev) => (prev.key === key && prev.slow ? { ...prev, slow: false } : prev));
      return undefined;
    });

    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [key, params, activeSources, update]);

  const loadMore = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    for (const source of activeSources) {
      const result = current.results[source];
      if (result.status !== 'success' || result.loadingMore || result.hits.length >= result.total) continue;
      update(key, source, () => ({ loadingMore: true }));
      const offset = result.hits.length;
      void (async () => {
        try {
          const page = await searchers[source]({ ...params, offset, limit: PAGE_SIZE, signal: controller.signal });
          update(key, source, (r) => {
            const seen = new Set(r.hits.map((h) => h.key));
            return { hits: [...r.hits, ...page.hits.filter((h) => !seen.has(h.key))], total: page.total, loadingMore: false, error: null };
          });
        } catch (error) {
          if (!isAbortError(error)) update(key, source, () => ({ loadingMore: false, error: errorMessage(error) }));
        }
      })();
    }
  }, [activeSources, current, key, params, update]);

  const retryLoadMore = useCallback(() => {
    for (const source of activeSources) update(key, source, () => ({ error: null }));
    loadMore();
  }, [activeSources, key, update, loadMore]);

  const { results } = current;
  const hits = useMemo(() => (filter === 'all' ? interleave(results.modrinth.hits, results.curseforge.hits) : results[filter].hits), [filter, results]);

  return {
    hits,
    results,
    activeSources,
    curseForgeEnabled,
    loading: activeSources.some((s) => results[s].status === 'loading'),
    loadingMore: activeSources.some((s) => results[s].loadingMore),
    hasMore: activeSources.some((s) => results[s].status === 'success' && results[s].hits.length < results[s].total),
    /** A failed "load more" stops infinite scroll until the user retries. */
    loadMoreFailed: activeSources.some((s) => results[s].status === 'success' && results[s].error !== null),
    allFailed: activeSources.length > 0 && activeSources.every((s) => results[s].status === 'error'),
    slow: current.slow,
    loadMore,
    retryLoadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
