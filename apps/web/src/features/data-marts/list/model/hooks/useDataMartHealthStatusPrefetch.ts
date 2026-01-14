import { useEffect, useRef } from 'react';
import type { Table } from '@tanstack/react-table';

import { fetchAndCacheHealthStatus } from '../../../shared/services/data-mart-health-status.service';

interface UseDataMartHealthStatusPrefetchOptions<TData> {
  table: Table<TData>;
  isLoading?: boolean;
  concurrency?: number;
  maxPrefetch?: number;
}

/**
 * Prefetches health status for visible Data Marts in the table.
 *
 * GUARANTEES:
 * - Prefetch health status after page reload
 * - Prefetch reacts to pagination / sorting changes
 * - Never refetches the same Data Mart twice
 */
export function useDataMartHealthStatusPrefetch<TData>({
  table,
  isLoading = false,
  concurrency = 5,
  maxPrefetch,
}: UseDataMartHealthStatusPrefetchOptions<TData>) {
  const prefetchedIdsRef = useRef<Set<string>>(new Set());

  const {
    pagination: { pageIndex, pageSize },
    sorting,
  } = table.getState();

  useEffect(() => {
    if (isLoading) return;

    const rows = table.getPaginationRowModel().rows;
    if (!rows.length) return;

    let ids = rows
      .map(row => (row.original as { id: string }).id)
      .filter(id => !prefetchedIdsRef.current.has(id));

    if (!ids.length) return;

    if (typeof maxPrefetch === 'number') {
      ids = ids.slice(0, maxPrefetch);
    }

    const prefetch = async () => {
      for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency);

        await Promise.allSettled(
          batch.map(async id => {
            await fetchAndCacheHealthStatus(id);
            prefetchedIdsRef.current.add(id);
          })
        );
      }
    };

    void prefetch();
  }, [table, isLoading, concurrency, maxPrefetch, pageIndex, pageSize, sorting]);
}
