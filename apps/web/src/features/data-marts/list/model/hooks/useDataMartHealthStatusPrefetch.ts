import { useEffect, useRef } from 'react';
import type { Table } from '@tanstack/react-table';

import { fetchAndCacheBatchHealthStatus } from '../../../shared/services/data-mart-health-status.service';

const BATCH_SIZE = 100;

interface UseDataMartHealthStatusPrefetchOptions<TData> {
  table: Table<TData>;
  isLoading?: boolean;
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

    const ids = rows
      .map(row => (row.original as { id: string }).id)
      .filter(id => !prefetchedIdsRef.current.has(id));

    if (!ids.length) return;

    const prefetch = async () => {
      // Limiting batch size and concurrency to reduce server load
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);

        await fetchAndCacheBatchHealthStatus(batch);

        for (const id of batch) {
          prefetchedIdsRef.current.add(id);
        }
      }
    };

    void prefetch();
  }, [table, isLoading, pageIndex, pageSize, sorting]);
}
