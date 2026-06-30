import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArchiveRestore, Box, ChevronRight, DatabaseIcon, Loader2, Search } from 'lucide-react';
import { Input } from '@owox/ui/components/input';
import { useProjectRoute } from '../../shared/hooks';
import type { AppIcon } from '../../shared';
import { useSearch } from './useSearch';

const ENTITY_TYPE_META: Partial<
  Record<string, { label: string; icon: AppIcon; to: (entityId: string) => string }>
> = {
  DATA_MART: {
    label: 'Data Mart',
    icon: Box,
    to: entityId => `/data-marts/${entityId}/data-setup`,
  },
  DATA_STORAGE: {
    label: 'Storage',
    icon: DatabaseIcon,
    to: entityId => `/data-storages?id=${entityId}`,
  },
  DATA_DESTINATION: {
    label: 'Destination',
    icon: ArchiveRestore,
    to: entityId => `/data-destinations?id=${entityId}`,
  },
};

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(queryParam);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isFetching, hasQuery, isError, retry, isDebouncing } = useSearch(query);
  const { scope } = useProjectRoute();
  const visibleResults = results.filter(result => Boolean(ENTITY_TYPE_META[result.entityType]));
  const unsupportedCount = results.length - visibleResults.length;
  const showLoading = isFetching || isDebouncing;

  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);

  useEffect(() => {
    const focusSearchInput = () => {
      inputRef.current?.focus();
    };

    window.addEventListener('owox:focus-search-input', focusSearchInput);
    return () => {
      window.removeEventListener('owox:focus-search-input', focusSearchInput);
    };
  }, []);

  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6'>
      <div className='relative'>
        {isFetching ? (
          <Loader2 className='text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2 animate-spin' />
        ) : (
          <Search className='text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2' />
        )}
        <Input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={event => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setSearchParams(
              current => {
                const next = new URLSearchParams(current);
                if (nextQuery.length > 0) {
                  next.set('q', nextQuery);
                } else {
                  next.delete('q');
                }
                return next;
              },
              { replace: true }
            );
          }}
          placeholder='Search…'
          aria-label='Search'
          className='h-12 pl-10 text-base'
        />
      </div>

      {!hasQuery ? (
        <p className='text-muted-foreground py-12 text-center text-sm'>
          Start typing to search across data marts, storages, and destinations.
        </p>
      ) : showLoading ? (
        <p className='text-muted-foreground py-12 text-center text-sm'>Searching…</p>
      ) : isError ? (
        <div className='flex flex-col items-center gap-3 py-12 text-center'>
          <p className='text-muted-foreground text-sm'>Search failed.</p>
          <button
            type='button'
            onClick={() => {
              retry();
            }}
            className='border-input hover:bg-muted rounded-md border px-3 py-1.5 text-sm transition-colors'
          >
            Retry
          </button>
        </div>
      ) : results.length === 0 ? (
        <p className='text-muted-foreground py-12 text-center text-sm'>No results found.</p>
      ) : (
        <div className='flex flex-col gap-0.5'>
          {unsupportedCount > 0 ? (
            <p className='text-muted-foreground px-3 py-2 text-sm'>
              Some results could not be displayed.
            </p>
          ) : null}
          {visibleResults.map(result => {
            const meta = ENTITY_TYPE_META[result.entityType];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <Link
                key={result.entityId}
                to={scope(meta.to(result.entityId))}
                className='group hover:bg-muted/60 flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors'
              >
                <span className='flex min-w-0 flex-col gap-0.5'>
                  <span className='truncate text-sm font-medium'>{result.title}</span>
                  <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                    <Icon className='size-3.5 shrink-0' aria-hidden='true' />
                    {meta.label}
                  </span>
                </span>
                <ChevronRight className='text-muted-foreground/40 group-hover:text-muted-foreground size-4 shrink-0 transition-colors' />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
