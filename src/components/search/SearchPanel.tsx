import { CircleAlert, Clock, KeyRound, PackageSearch, RefreshCw, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModSearch } from '../../hooks/useModSearch';
import { loaderName } from '../../api/modrinth';
import { packStore } from '../../state/packStore';
import { useStore } from '../../state/store';
import type { ModSource, SourceFilter } from '../../types';
import { Button, Callout, SOURCE_LABEL, Segmented } from '../ui/primitives';
import { ResultCard, ResultSkeleton } from './ResultCard';

export function SearchPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const profile = useStore(packStore, (s) => s.profile);
  const packMods = useStore(packStore, (s) => s.mods);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const query = useDebouncedValue(input.trim(), 400);
  const search = useModSearch(query, filter, profile);

  const failedSources = search.activeSources.filter((s) => search.results[s].status === 'error' || (search.results[s].error && search.results[s].status === 'success'));
  const cfDisabled = filter !== 'modrinth' && !search.curseForgeEnabled;
  const showSkeletons = search.loading && search.hits.length === 0;
  const isEmpty = !search.loading && !search.allFailed && search.hits.length === 0 && search.activeSources.length > 0;

  return (
    <section aria-label="Search mods" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Search ${loaderName(profile.loader)} mods for ${profile.gameVersion}…`}
            aria-label="Search mods"
            className="h-12 w-full rounded-xl bg-slate-900 pl-11 pr-10 text-base text-white ring-1 ring-inset ring-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Segmented<SourceFilter>
          label="Data source"
          value={filter}
          onChange={setFilter}
          className="h-12 items-stretch"
          options={[
            { value: 'all', label: 'All' },
            { value: 'modrinth', label: 'Modrinth', activeClass: 'bg-emerald-500 text-slate-950 shadow' },
            { value: 'curseforge', label: 'CurseForge', activeClass: 'bg-orange-500 text-slate-950 shadow' },
          ]}
        />
      </div>

      <div className="flex min-h-5 items-center justify-between gap-2 text-sm text-slate-400" aria-live="polite">
        <span>
          {search.loading && search.hits.length === 0
            ? 'Searching…'
            : query
              ? `Results for “${query}”`
              : `Popular ${loaderName(profile.loader)} mods for ${profile.gameVersion}`}
        </span>
        {search.activeSources.length > 0 && !search.loading && (
          <span className="text-xs text-slate-500">
            {search.activeSources.map((s) => `${SOURCE_LABEL[s]}: ${search.results[s].total.toLocaleString()}`).join(' · ')}
          </span>
        )}
      </div>

      {cfDisabled && (
        <Callout
          tone="info"
          icon={<KeyRound className="size-4" />}
          title="CurseForge needs an API key"
          action={
            <Button size="sm" onClick={onOpenSettings}>
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

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {search.hits.map((hit) => (
          <ResultCard key={hit.key} hit={hit} packStatus={packMods[hit.key]?.status ?? null} />
        ))}
        {showSkeletons && Array.from({ length: 6 }, (_, i) => <ResultSkeleton key={i} />)}
      </div>

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-800 px-6 py-14 text-center">
          <PackageSearch className="size-10 text-slate-600" aria-hidden />
          <div>
            <p className="font-semibold text-slate-200">No mods found</p>
            <p className="mt-1 text-sm text-slate-500">
              Nothing matches {query ? `“${query}”` : 'this profile'} for {loaderName(profile.loader)} {profile.gameVersion}. Try another
              search term, data source, or Minecraft version.
            </p>
          </div>
        </div>
      )}

      {search.hasMore && search.hits.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button onClick={search.loadMore} loading={search.loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
