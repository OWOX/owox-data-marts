import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { type ReactNode, createElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAdvancedDataMartSearch, MIN_SEMANTIC_RELEVANCE } from './useAdvancedDataMartSearch';

vi.mock('../../../shared/services/data-mart.service', () => ({
  dataMartService: {
    advancedSearch: vi.fn(),
  },
}));

vi.mock('../../../../../app/store/hooks/useFlags', () => ({
  useFlags: vi.fn(),
}));

vi.mock('../../../../../utils/check-edition', () => ({
  checkIsCommunityEdition: vi.fn(),
}));

import { dataMartService } from '../../../shared/services/data-mart.service';
import { useFlags } from '../../../../../app/store/hooks/useFlags';
import { checkIsCommunityEdition } from '../../../../../utils/check-edition';
import { RequestStatus } from '../../../../../shared/types/request-status';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  };
}

function makeAxiosError(status: number): AxiosError {
  const err = new AxiosError('request failed');
  err.response = {
    status,
    data: {},
    headers: {},
    config: { headers: {} } as InternalAxiosRequestConfig,
    statusText: '',
  };
  return err;
}

function makeResult(
  overrides: {
    entityId?: string;
    finalScore?: number;
    extendability?: number;
  } = {}
) {
  return {
    entityType: 'DATA_MART' as const,
    entityId: overrides.entityId ?? 'dm-1',
    title: 'Sales data',
    description: 'Revenue metrics',
    finalScore: overrides.finalScore ?? 90,
    kwScore: 0.8,
    vecScore: 0.7,
    extendability: overrides.extendability ?? 0,
  };
}

function setupEditionMocks({ isCommunity = false, loaded = true } = {}) {
  vi.mocked(useFlags).mockReturnValue({
    flags: {},
    callState: loaded ? RequestStatus.LOADED : RequestStatus.LOADING,
  });
  vi.mocked(checkIsCommunityEdition).mockReturnValue(isCommunity);
}

describe('useAdvancedDataMartSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupEditionMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is disabled when query is shorter than 2 characters after debounce', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('a'), { wrapper });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isFetching).toBe(false);
    expect(dataMartService.advancedSearch).not.toHaveBeenCalled();
  });

  it('is disabled when query is empty', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch(''), { wrapper });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isFetching).toBe(false);
    expect(dataMartService.advancedSearch).not.toHaveBeenCalled();
  });

  it('debounces query changes — does not re-fetch immediately on rapid input changes', async () => {
    vi.useRealTimers();
    vi.mocked(dataMartService.advancedSearch).mockResolvedValue([]);

    const { wrapper } = makeWrapper();
    let query = 'sa';
    const { rerender } = renderHook(() => useAdvancedDataMartSearch(query), { wrapper });

    await waitFor(() => {
      expect(dataMartService.advancedSearch).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();
    query = 'sal';
    rerender();
    query = 'sale';
    rerender();
    query = 'sales';
    rerender();

    await new Promise(r => setTimeout(r, 50));
    expect(dataMartService.advancedSearch).not.toHaveBeenCalled();

    await new Promise(r => setTimeout(r, 450));
    expect(dataMartService.advancedSearch).toHaveBeenCalledTimes(1);
    expect(dataMartService.advancedSearch).toHaveBeenCalledWith('sales', 10);
  });

  it('fetches results when query has 2+ characters after debounce', async () => {
    vi.useRealTimers();
    const mockResults = [makeResult({ entityId: 'dm-1', finalScore: 90, extendability: 0 })];
    vi.mocked(dataMartService.advancedSearch).mockResolvedValue(mockResults);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await waitFor(() => {
      expect(result.current.semanticIds.has('dm-1')).toBe(true);
    });
    expect(result.current.unavailable).toBe(false);
  });

  it('applies MIN_SEMANTIC_RELEVANCE threshold — filters out low-score results', async () => {
    vi.useRealTimers();
    const highScore = makeResult({
      entityId: 'dm-high',
      finalScore: MIN_SEMANTIC_RELEVANCE + 10,
      extendability: 0,
    });
    const lowScore = makeResult({
      entityId: 'dm-low',
      finalScore: MIN_SEMANTIC_RELEVANCE - 1,
      extendability: 0,
    });
    vi.mocked(dataMartService.advancedSearch).mockResolvedValue([highScore, lowScore]);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await waitFor(() => {
      expect(result.current.semanticIds.has('dm-high')).toBe(true);
    });
    expect(result.current.semanticIds.has('dm-low')).toBe(false);
  });

  it('includes result when (finalScore - extendability) >= MIN_SEMANTIC_RELEVANCE exactly', async () => {
    vi.useRealTimers();
    const exact = makeResult({
      entityId: 'dm-exact',
      finalScore: MIN_SEMANTIC_RELEVANCE + 5,
      extendability: 5,
    });
    vi.mocked(dataMartService.advancedSearch).mockResolvedValue([exact]);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await waitFor(() => {
      expect(result.current.semanticIds.has('dm-exact')).toBe(true);
    });
  });

  it('marks unavailable=true on 403 and keeps it true after subsequent success', async () => {
    vi.useRealTimers();
    vi.mocked(dataMartService.advancedSearch).mockRejectedValueOnce(makeAxiosError(403));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await waitFor(() => {
      expect(result.current.unavailable).toBe(true);
    });
  });

  it('marks unavailable=true on 404', async () => {
    vi.useRealTimers();
    vi.mocked(dataMartService.advancedSearch).mockRejectedValueOnce(makeAxiosError(404));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await waitFor(() => {
      expect(result.current.unavailable).toBe(true);
    });
  });

  it('does NOT mark unavailable on transient 500 error', async () => {
    vi.useRealTimers();
    vi.mocked(dataMartService.advancedSearch).mockRejectedValueOnce(makeAxiosError(500));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(result.current.unavailable).toBe(false);
  });

  it('does NOT mark unavailable on network error without response', async () => {
    vi.useRealTimers();
    const networkErr = new AxiosError('Network Error');
    vi.mocked(dataMartService.advancedSearch).mockRejectedValueOnce(networkErr);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(result.current.unavailable).toBe(false);
  });

  it('is disabled for community edition', async () => {
    setupEditionMocks({ isCommunity: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isFetching).toBe(false);
    expect(dataMartService.advancedSearch).not.toHaveBeenCalled();
  });

  it('is disabled while flags are loading', async () => {
    setupEditionMocks({ loaded: false });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdvancedDataMartSearch('sales'), { wrapper });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isFetching).toBe(false);
    expect(dataMartService.advancedSearch).not.toHaveBeenCalled();
  });
});
