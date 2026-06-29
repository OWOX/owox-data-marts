import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { useProjectId } from '../../shared/hooks';
import { searchService } from '../../features/search/shared';
import type { SearchResultResponseDto } from '../../features/search/shared';

const QUERY_KEY = 'search';
export const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 25;
const DEBOUNCE_MS = 400;
const EMPTY: SearchResultResponseDto[] = [];

export interface UseSearchResult {
  results: SearchResultResponseDto[];
  isFetching: boolean;
  hasQuery: boolean;
  isError: boolean;
  error: Error | null;
  retry: () => void;
  isDebouncing: boolean;
}

export function useSearch(query: string): UseSearchResult {
  const projectId = useProjectId();

  const trimmedQuery = query.trim();
  const debouncedQuery = useDebounce(trimmedQuery, DEBOUNCE_MS);
  const hasQuery = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const enabled = debouncedQuery.length >= MIN_QUERY_LENGTH && Boolean(projectId);
  const isDebouncing = hasQuery && trimmedQuery !== debouncedQuery;

  const { data, isFetching, isError, error, refetch } = useQuery<SearchResultResponseDto[]>({
    queryKey: [QUERY_KEY, projectId, debouncedQuery],
    queryFn: ({ signal }) =>
      searchService.search(debouncedQuery, {
        limit: SEARCH_LIMIT,
        config: { signal },
      }),
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const results = data ?? EMPTY;

  return {
    results,
    isFetching: enabled && isFetching,
    hasQuery,
    isError,
    error,
    retry: () => {
      void refetch();
    },
    isDebouncing,
  };
}
