import { type ColumnDef, type Row } from '@tanstack/react-table';
import { EmptyDataDestinationsState } from './EmptyDataDestinationsState';
import { useBaseTable } from '../../../../../shared/hooks';
import {
  BaseTable,
  TableCTAButton,
  TableColumnSearch,
} from '../../../../../shared/components/Table';
import { DataDestinationColumnKey } from './columns/columnKeys';

interface DataDestinationTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onRotateSecretKey?: (id: string) => void;
  onOpenTypeDialog?: () => void;
}

export function DataDestinationTable<TData, TValue>({
  columns,
  data,
  onEdit,
  onOpenTypeDialog,
}: DataDestinationTableProps<TData, TValue>) {
  // Initialize table with shared hook
  const { table } = useBaseTable<TData>({
    data,
    columns: columns as ColumnDef<TData>[],
    storageKeyPrefix: 'data-destination-list',
    enableRowSelection: false,
  });

  // Row click handler
  const handleRowClick = (row: Row<TData>, e: React.MouseEvent) => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('[role="checkbox"]') ||
        e.target.closest('.actions-cell') ||
        e.target.closest('[role="menuitem"]'))
    ) {
      return;
    }

    const id = (row.original as { id: string }).id;
    void onEdit?.(id);
  };

  // Show custom empty state when no data
  if (!data.length) {
    return (
      <div className='dm-card'>
        <EmptyDataDestinationsState onOpenTypeDialog={onOpenTypeDialog} />
      </div>
    );
  }

  const tableId = 'data-destinations-table';

  return (
    <div className='dm-card'>
      <BaseTable
        tableId={tableId}
        table={table}
        onRowClick={handleRowClick}
        ariaLabel='Destinations table'
        paginationProps={{ displaySelected: false }}
        renderToolbarLeft={table => (
          <TableColumnSearch
            table={table}
            columnId={DataDestinationColumnKey.TITLE}
            placeholder='Search by title'
          />
        )}
        renderToolbarRight={() => (
          <TableCTAButton onClick={onOpenTypeDialog}>New Destination</TableCTAButton>
        )}
      />
    </div>
  );
}
