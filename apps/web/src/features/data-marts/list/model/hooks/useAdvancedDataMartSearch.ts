import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from '../../../../../hooks/useDebounce';
import { useFlags } from '../../../../../app/store/hooks/useFlags';
import { RequestStatus } from '../../../../../shared/types/request-status';
import { checkIsCommunityEdition } from '../../../../../utils/check-edition';
import { dataMartService } from '../../../shared';

const QUERY_KEY = 'data-marts-advanced-search';

export const MIN_QUERY_LENGTH = 2;
export const DEFAULT_SEARCH_LIMIT = 10;
export const MIN_SEMANTIC_RELEVANCE = 20;

const DEBOUNCE_MS = 400;

const PERMANENT_UNAVAILABLE_STATUSES = new Set([403, 404]);
const EMPTY_SET = new Set<string>();

function isPermanentlyUnavailable(error: unknown): boolean {
  return isAxiosError(error) && PERMANENT_UNAVAILABLE_STATUSES.has(error.response?.status ?? 0);
}

export interface UseAdvancedDataMartSearchResult {
  semanticIds: Set<string>;
  isFetching: boolean;
  unavailable: boolean;
}

export function useAdvancedDataMartSearch(
  query: string,
  limit = DEFAULT_SEARCH_LIMIT
): UseAdvancedDataMartSearchResult {
  const { flags, callState } = useFlags();
  const isCommunity = checkIsCommunityEdition(flags);
  const flagsLoaded = callState === RequestStatus.LOADED || callState === RequestStatus.ERROR;

  const [unavailable, setUnavailable] = useState(false);

  const debouncedQuery = useDebounce(query.trim(), DEBOUNCE_MS);
  const isEnterpriseAvailable = flagsLoaded && !isCommunity;
  const enabled =
    debouncedQuery.length >= MIN_QUERY_LENGTH && isEnterpriseAvailable && !unavailable;

  const { data, isFetching, error } = useQuery({
    queryKey: [QUERY_KEY, debouncedQuery, limit],
    queryFn: () => dataMartService.advancedSearch(debouncedQuery, limit),
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isPermanentlyUnavailable(error)) {
      setUnavailable(true);
    }
  }, [error]);

  const semanticIds = useMemo(() => {
    if (unavailable || !data) return EMPTY_SET;
    return new Set(
      data
        .filter(r => r.finalScore - r.extendability >= MIN_SEMANTIC_RELEVANCE)
        .map(r => r.entityId)
    );
  }, [unavailable, data]);

  return {
    semanticIds,
    isFetching,
    unavailable,
  };
}
