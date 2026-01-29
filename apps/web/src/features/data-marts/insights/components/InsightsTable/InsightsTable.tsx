import { useMemo } from 'react';
import { getInsightColumns, type InsightTableItem } from './columns';
import { BaseTable } from '../../../../../shared/components/Table';
import { useBaseTable } from '../../../../../shared/hooks';

interface InsightsTableProps {
  items: InsightTableItem[];
  onRowClick: (id: string) => void;
  onDelete: (id: string) => void;
}

export function InsightsTable({ items, onRowClick, onDelete }: InsightsTableProps) {
  const columns = useMemo(() => getInsightColumns({ onDelete }), [onDelete]);

  const { table } = useBaseTable<InsightTableItem>({
    data: items,
    columns,
    storageKeyPrefix: 'data-mart-insights',
    defaultSortingColumn: 'lastRun',
    enableRowSelection: false,
  });

  const tableId = 'insights-table';

  return (
    <>
      <BaseTable
        tableId={tableId}
        table={table}
        onRowClick={row => {
          onRowClick(row.original.id);
        }}
        ariaLabel='Insights'
        paginationProps={{
          displaySelected: false,
        }}
        renderEmptyState={() => (
          <span role='status' aria-live='polite'>
            No insights found.
          </span>
        )}
      />
    </>
  );
}
