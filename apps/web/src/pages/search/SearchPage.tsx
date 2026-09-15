import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArchiveRestore,
  Box,
  ChevronRight,
  DatabaseIcon,
  FileText,
  Loader2,
  Search,
} from 'lucide-react';
import { Input } from '@owox/ui/components/input';
import { useProjectRoute } from '../../shared/hooks';
import type { AppIcon } from '../../shared';
import type { SearchResultResponseDto } from '../../features/search/shared';
import { useSearch } from './useSearch';

interface EntityTypeMeta {
  label: string;
  icon: AppIcon;
  to: (result: SearchResultResponseDto) => string | null;
  title?: (result: SearchResultResponseDto) => string;
  context?: (result: SearchResultResponseDto) => string | null;
}

const ENTITY_TYPE_META: Partial<Record<string, EntityTypeMeta>> = {
  DATA_MART: {
    label: 'Data Mart',
    icon: Box,
    to: result => `/data-marts/${result.entityId}/data-setup`,
  },
  DATA_STORAGE: {
    label: 'Storage',
    icon: DatabaseIcon,
    to: result => `/data-storages?id=${result.entityId}`,
  },
  DATA_DESTINATION: {
    label: 'Destination',
    icon: ArchiveRestore,
    to: result => `/data-destinations?id=${result.entityId}`,
  },
  REPORT: {
    label: 'Report',
    icon: FileText,
    to: result =>
      result.report
        ? `/data-marts/${result.report.dataMart.id}/reports?reportId=${result.entityId}`
        : null,
    title: result => result.title || (result.report?.dataDestination.title ?? ''),
    context: result =>
      result.report
        ? `${result.report.dataMart.title} · ${result.report.dataDestination.title}`
        : null,
  },
};

function toDisplayItem(result: SearchResultResponseDto) {
  const meta = ENTITY_TYPE_META[result.entityType];
  const to = meta?.to(result);
  if (!meta || !to) return [];
  return [
    {
      result,
      meta,
      to,
      title: meta.title?.(result) ?? result.title,
      context: meta.context?.(result) ?? null,
    },
  ];
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(queryParam);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isFetching, hasQuery, isError, retry, isDebouncing } = useSearch(query);
  const { scope } = useProjectRoute();
  const items = results.flatMap(toDisplayItem);
  const unsupportedCount = results.length - items.length;
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
          Start typing to search across data marts, storages, destinations, and reports.
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
          {items.map(({ result, meta, to, title, context }) => {
            const Icon = meta.icon;
            return (
              <Link
                key={result.entityId}
                to={scope(to)}
                className='group hover:bg-muted/60 flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors'
              >
                <span className='flex min-w-0 flex-col gap-0.5'>
                  <span className='truncate text-sm font-medium'>{title}</span>
                  <span className='text-muted-foreground flex min-w-0 items-center gap-1 text-xs'>
                    <Icon className='size-3.5 shrink-0' aria-hidden='true' />
                    <span className='shrink-0'>{meta.label}</span>
                    {context ? (
                      <>
                        <span aria-hidden='true'>·</span>
                        <span className='truncate'>{context}</span>
                      </>
                    ) : null}
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
