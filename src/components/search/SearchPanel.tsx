import { ArrowUpDown, CircleAlert, Clock, EyeOff, KeyRound, LayoutGrid, List, PackageSearch, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModSearch } from '../../hooks/useModSearch';
import { pluralize } from '../../lib/format';
import { packCoverage } from '../../state/pack';
import { packStore } from '../../state/packStore';
import { SORTS, preferencesStore, setPreferences, type SearchSort } from '../../state/preferences';
import { useStore } from '../../state/store';
import { ui } from '../../state/ui';
import { loaderName, type ModSource, type SourceFilter } from '../../types';
import { Button, Callout, IconButton, SOURCE_LABEL, Segmented, Select, Spinner, cx } from '../ui/primitives';
import { ResultCard, ResultSkeleton } from './ResultCard';

export function SearchPanel() {
  const profile = useStore(packStore, (s) => s.profile);
  const pack = useStore(packStore, (s) => s);
  const prefs = useStore(preferencesStore, (s) => s);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const query = useDebouncedValue(input.trim(), 350);
  const search = useModSearch(query, filter, profile, prefs.sort);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const coverage = useMemo(() => packCoverage(pack), [pack]);
  const visibleHits = useMemo(
    () => (prefs.hideAdded ? search.hits.filter((h) => !coverage.has(h.key)) : search.hits),
    [prefs.hideAdded, search.hits, coverage],
  );
  const hiddenCount = search.hits.length - visibleHits.length;

  // "/" focuses search from anywhere (unless the user is typing in another field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== '/' || event.ctrlKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Infinite scroll: fetch the next page when the sentinel approaches the viewport.
  const canAutoLoad = prefs.infiniteScroll && search.hasMore && !search.loading && !search.loadingMore && !search.loadMoreFailed;
  const loadMoreRef = useRef(search.loadMore);
  loadMoreRef.current = search.loadMore;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canAutoLoad) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMoreRef.current(), { rootMargin: '800px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canAutoLoad, visibleHits.length]);

  const failedSources = search.activeSources.filter((s) => search.results[s].status === 'error');
  const cfDisabled = filter !== 'modrinth' && !search.curseForgeEnabled;
  const showSkeletons = search.loading && visibleHits.length === 0;
  const isEmpty = !search.loading && !search.allFailed && search.hits.length === 0 && search.activeSources.length > 0;
  const allHidden = !search.loading && search.hits.length > 0 && visibleHits.length === 0 && !search.hasMore;
  const compact = prefs.density === 'compact';

  return (
    <section aria-label="Search mods" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-base-500" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setInput('')}
            placeholder={`Search ${loaderName(profile.loader)} mods for ${profile.gameVersion}…`}
            aria-label="Search mods"
            className="h-12 w-full rounded-xl bg-base-900 pl-11 pr-16 text-base text-base-50 ring-1 ring-inset ring-base-700 placeholder:text-base-500 focus:outline-none focus:ring-2 focus:ring-accent-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {input ? (
            <button
              type="button"
              onClick={() => setInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-base-400 hover:text-base-50"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-base-700 px-1.5 text-xs text-base-500 sm:block">/</kbd>
          )}
        </div>
        <Segmented<SourceFilter>
          label="Data source"
          value={filter}
          onChange={setFilter}
          className="h-12 items-stretch"
          options={[
            { value: 'all', label: 'All' },
            { value: 'modrinth', label: 'Modrinth', activeClass: 'bg-emerald-500 text-ink shadow' },
            { value: 'curseforge', label: 'CurseForge', activeClass: 'bg-orange-500 text-ink shadow' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Sort results"
          value={prefs.sort}
          onChange={(e) => setPreferences({ sort: e.target.value as SearchSort })}
          icon={<ArrowUpDown className="size-4" />}
          className="w-48"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <IconButton
          label={prefs.hideAdded ? 'Showing only mods not in your pack' : 'Hide mods already in your pack'}
          tone={prefs.hideAdded ? 'active' : 'default'}
          aria-pressed={prefs.hideAdded}
          onClick={() => setPreferences({ hideAdded: !prefs.hideAdded })}
          className="size-10"
        >
          <EyeOff className="size-4" />
        </IconButton>
        <Segmented
          label="Result layout"
          value={prefs.resultView}
          onChange={(resultView) => setPreferences({ resultView })}
          className="h-10"
          options={[
            { value: 'grid', label: <LayoutGrid className="size-4" aria-label="Grid" />, title: 'Grid view' },
            { value: 'list', label: <List className="size-4" aria-label="List" />, title: 'List view' },
          ]}
        />
        <p className="ml-auto text-xs text-base-500" aria-live="polite">
          {search.loading && search.hits.length === 0
            ? 'Searching…'
            : search.activeSources.map((s) => `${SOURCE_LABEL[s]}: ${search.results[s].total.toLocaleString()}`).join(' · ')}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </p>
      </div>

      {cfDisabled && (
        <Callout
          tone="info"
          icon={<KeyRound className="size-4" />}
          title="CurseForge needs an API key"
          action={
            <Button size="sm" onClick={() => ui.openSettings('curseforge')}>
              Configure
            </Button>
          }
        >
          {filter === 'curseforge'
            ? 'CurseForge’s API requires an x-api-key header. Add your own key or a proxy URL to search CurseForge.'
            : 'Showing Modrinth only. Add a CurseForge API key or proxy URL to search both platforms.'}
        </Callout>
      )}

      {failedSources.map((source: ModSource) => (
        <Callout
          key={source}
          tone="error"
          icon={<CircleAlert className="size-4" />}
          title={`${SOURCE_LABEL[source]} search failed`}
          action={
            <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={search.retry}>
              Retry
            </Button>
          }
        >
          {search.results[source].error}
        </Callout>
      ))}

      {search.slow && search.loading && (
        <Callout tone="warning" icon={<Clock className="size-4" />}>
          The mod APIs are responding slowly. Results will appear as soon as they arrive.
        </Callout>
      )}

      <div
        className={cx(
          'grid',
          prefs.resultView === 'list'
            ? compact
              ? 'gap-1.5'
              : 'gap-2'
            : compact
              ? 'gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
              : 'gap-3 sm:grid-cols-2 2xl:grid-cols-3',
        )}
      >
        {visibleHits.map((hit) => (
          <ResultCard
            key={hit.key}
            hit={hit}
            packMod={coverage.get(hit.key) ?? null}
            view={prefs.resultView}
            density={prefs.density}
            showDescription={prefs.showDescriptions}
          />
        ))}
        {showSkeletons && Array.from({ length: 6 }, (_, i) => <ResultSkeleton key={i} view={prefs.resultView} />)}
      </div>

      {(isEmpty || allHidden) && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-base-800 px-6 py-14 text-center">
          <PackageSearch className="size-10 text-base-600" aria-hidden />
          <div>
            <p className="font-semibold text-base-200">{allHidden ? 'Everything here is already in your pack' : 'No mods found'}</p>
            <p className="mt-1 text-sm text-base-500">
              {allHidden
                ? `${pluralize(hiddenCount, 'result')} hidden because they’re already added.`
                : `Nothing matches ${query ? `“${query}”` : 'this profile'} for ${loaderName(profile.loader)} ${profile.gameVersion}. Try another search term, data source, or Minecraft version.`}
            </p>
          </div>
          {allHidden && (
            <Button size="sm" onClick={() => setPreferences({ hideAdded: false })}>
              Show added mods
            </Button>
          )}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {search.hasMore && search.hits.length > 0 && (
        <div className="flex flex-col items-center gap-2 pb-2">
          {search.loadMoreFailed ? (
            <>
              <p className="text-sm text-rose-300">Couldn’t load more results.</p>
              <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={search.retryLoadMore}>
                Try again
              </Button>
            </>
          ) : prefs.infiniteScroll ? (
            search.loadingMore && (
              <span className="flex items-center gap-2 text-sm text-base-400">
                <Spinner /> Loading more…
              </span>
            )
          ) : (
            <Button onClick={search.loadMore} loading={search.loadingMore}>
              Load more
            </Button>
          )}
        </div>
      )}
      {!search.hasMore && search.hits.length > 0 && !search.loading && (
        <p className="pb-2 text-center text-xs text-base-600">You’ve reached the end of the results.</p>
      )}
    </section>
  );
}
