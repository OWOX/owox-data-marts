import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const { mockSearch, mockUseProjectId } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockUseProjectId: vi.fn(),
}));

vi.mock('../../shared/hooks', () => ({ useProjectId: mockUseProjectId }));
vi.mock('../../features/search/shared', () => ({
  searchService: { search: mockSearch },
}));

import { useSearch, MIN_QUERY_LENGTH } from './useSearch';

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectId.mockReturnValue('project-1');
    mockSearch.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasQuery', () => {
    it('is false when query is shorter than MIN_QUERY_LENGTH', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('a'), { wrapper });
      expect(result.current.hasQuery).toBe(false);
    });

    it('is true when query meets MIN_QUERY_LENGTH', () => {
      const { wrapper } = createWrapper();
      const query = 'x'.repeat(MIN_QUERY_LENGTH);
      const { result } = renderHook(() => useSearch(query), { wrapper });
      expect(result.current.hasQuery).toBe(true);
    });

    it('is false for whitespace-only query (trimmed)', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('   '), { wrapper });
      expect(result.current.hasQuery).toBe(false);
    });
  });

  describe('errors', () => {
    it('exposes request errors to the page', async () => {
      const axiosError = Object.assign(new Error('Forbidden'), {
        isAxiosError: true,
        response: { status: 403 },
      });
      mockSearch.mockRejectedValue(axiosError);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('big query'), { wrapper });

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.results).toHaveLength(0);
      expect(result.current.error).toBe(axiosError);
    });

    it('does not convert 404 into permanent feature unavailability', async () => {
      const axiosError = Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
      mockSearch.mockRejectedValue(axiosError);

      const { wrapper } = createWrapper();
      renderHook(() => useSearch('big query'), { wrapper });

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledTimes(1);
      });
    });

    it('forwards React Query AbortSignal to the search service', async () => {
      mockSearch.mockResolvedValue([]);

      const { wrapper } = createWrapper();
      renderHook(() => useSearch('big query'), { wrapper });

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith(
          'big query',
          expect.objectContaining({
            config: expect.objectContaining({ signal: expect.any(AbortSignal) }),
          })
        );
      });
    });
  });

  describe('results', () => {
    it('returns empty array when no query', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch(''), { wrapper });
      expect(result.current.results).toHaveLength(0);
    });

    it('returns DATA_MART results from the service', async () => {
      const mockResults = [
        {
          entityType: 'DATA_MART' as const,
          entityId: 'dm-1',
          title: 'Sales Mart',
          description: null,
          finalScore: 0.9,
          kwScore: 0.9,
          vecScore: null,
        },
      ];
      mockSearch.mockResolvedValue(mockResults);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('sales'), { wrapper });

      await waitFor(() => {
        expect(result.current.results).toEqual(mockResults);
      });
    });

    it('returns DATA_STORAGE results from the service', async () => {
      const mockResults = [
        {
          entityType: 'DATA_STORAGE' as const,
          entityId: 'storage-1',
          title: 'BigQuery Prod',
          description: null,
          finalScore: 0.85,
          kwScore: 0.85,
          vecScore: null,
        },
      ];
      mockSearch.mockResolvedValue(mockResults);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('bigquery'), { wrapper });

      await waitFor(() => {
        expect(result.current.results).toEqual(mockResults);
      });
    });

    it('returns DATA_DESTINATION results from the service', async () => {
      const mockResults = [
        {
          entityType: 'DATA_DESTINATION' as const,
          entityId: 'dest-1',
          title: 'Weekly Sheets Export',
          description: null,
          finalScore: 0.8,
          kwScore: 0.8,
          vecScore: null,
        },
      ];
      mockSearch.mockResolvedValue(mockResults);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('weekly'), { wrapper });

      await waitFor(() => {
        expect(result.current.results).toEqual(mockResults);
      });
    });

    it('returns mixed-type results preserving server order', async () => {
      const mockResults = [
        {
          entityType: 'DATA_MART' as const,
          entityId: 'dm-1',
          title: 'Alpha Mart',
          description: null,
          finalScore: 0.9,
          kwScore: 0.9,
          vecScore: null,
        },
        {
          entityType: 'DATA_STORAGE' as const,
          entityId: 'storage-1',
          title: 'Beta Storage',
          description: null,
          finalScore: 0.85,
          kwScore: 0.85,
          vecScore: null,
        },
        {
          entityType: 'DATA_DESTINATION' as const,
          entityId: 'dest-1',
          title: 'Gamma Destination',
          description: null,
          finalScore: 0.8,
          kwScore: 0.8,
          vecScore: null,
        },
      ];
      mockSearch.mockResolvedValue(mockResults);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('alpha'), { wrapper });

      await waitFor(() => {
        expect(result.current.results).toHaveLength(3);
      });
      expect(result.current.results[0].entityType).toBe('DATA_MART');
      expect(result.current.results[1].entityType).toBe('DATA_STORAGE');
      expect(result.current.results[2].entityType).toBe('DATA_DESTINATION');
    });
  });

  describe('isFetching', () => {
    it('is false when query is too short', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('a'), { wrapper });
      expect(result.current.isFetching).toBe(false);
    });

    it('is false when there is no project context yet', () => {
      mockUseProjectId.mockReturnValue(null);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSearch('big query'), { wrapper });

      expect(mockSearch).not.toHaveBeenCalled();
      expect(result.current.isFetching).toBe(false);
    });
  });

  describe('project-scoped cache', () => {
    it('refetches the same query when the project changes', async () => {
      let projectId = 'project-1';
      mockUseProjectId.mockImplementation(() => projectId);
      mockSearch.mockResolvedValue([
        {
          entityType: 'DATA_MART' as const,
          entityId: 'dm-1',
          title: 'Sales Mart',
          description: null,
          finalScore: 0.9,
          kwScore: 0.9,
          vecScore: null,
        },
      ]);

      const { wrapper } = createWrapper();
      const { rerender } = renderHook(({ q }: { q: string }) => useSearch(q), {
        initialProps: { q: 'sales' },
        wrapper,
      });

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledTimes(1);
      });

      projectId = 'project-2';
      rerender({ q: 'sales' });

      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('debounce', () => {
    it('suppresses a query change until the debounce delay elapses', async () => {
      vi.useFakeTimers();
      const { wrapper } = createWrapper();
      const { result, rerender } = renderHook(({ q }: { q: string }) => useSearch(q), {
        initialProps: { q: 'fi' },
        wrapper,
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const callsAfterInitial = mockSearch.mock.calls.length;

      rerender({ q: 'fir' });

      expect(mockSearch.mock.calls.length).toBe(callsAfterInitial);
      expect(result.current.isDebouncing).toBe(true);

      vi.useRealTimers();
    });

    it('triggers a service call once the debounce delay elapses after a query change', async () => {
      vi.useFakeTimers();
      const { wrapper } = createWrapper();
      const { rerender } = renderHook(({ q }: { q: string }) => useSearch(q), {
        initialProps: { q: 'fi' },
        wrapper,
      });

      rerender({ q: 'fir' });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      vi.useRealTimers();

      await waitFor(() => {
        const latestArgs = mockSearch.mock.calls.at(-1);
        expect(latestArgs?.[0]).toBe('fir');
      });
    });
  });
});
