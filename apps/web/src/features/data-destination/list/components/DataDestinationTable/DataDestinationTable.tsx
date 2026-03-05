import { type ColumnDef, type Row } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  BaseTable,
  TableColumnSearch,
  TableCTAButton,
} from '../../../../../shared/components/Table';
import { applyFiltersToData } from '../../../../../shared/components/TableFilters';
import { useBaseTable, usePersistentFilters } from '../../../../../shared/hooks';
import type { DataDestinationTableItem } from './columns';
import { DataDestinationColumnKey } from './columns';
import { DataDestinationTableFilters } from './DataDestinationTableFilters';
import {
  buildDataDestinationTableFilters,
  dataDestinationFilterAccessors,
  type DataDestinationFilterKey,
} from './DataDestinationTableFilters.config';
import { EmptyDataDestinationsState } from './EmptyDataDestinationsState';

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
  const { projectId = '' } = useParams<{ projectId: string }>();
  const tableId = 'data-destinations-table';

  const filtersConfig = useMemo(
    () => buildDataDestinationTableFilters(data as DataDestinationTableItem[]),
    [data]
  );

  const { appliedState, apply, clear } = usePersistentFilters<DataDestinationFilterKey>({
    projectId,
    tableId,
    urlParam: 'filters',
    config: filtersConfig,
  });

  const filteredData = useMemo(
    () =>
      applyFiltersToData<DataDestinationFilterKey, DataDestinationTableItem>(
        data as DataDestinationTableItem[],
        appliedState,
        dataDestinationFilterAccessors
      ) as TData[],
    [data, appliedState]
  );

  // Initialize table with shared hook
  const { table } = useBaseTable<TData>({
    data: filteredData,
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

  return (
    <div className='dm-card'>
      <BaseTable
        tableId={tableId}
        table={table}
        onRowClick={handleRowClick}
        ariaLabel='Destinations table'
        paginationProps={{ displaySelected: false }}
        renderToolbarLeft={() => (
          <>
            <DataDestinationTableFilters
              appliedState={appliedState}
              config={filtersConfig}
              onApply={apply}
              onClear={clear}
            />
            <TableColumnSearch
              table={table}
              columnId={DataDestinationColumnKey.TITLE}
              placeholder='Search'
            />
          </>
        )}
        renderToolbarRight={() => (
          <TableCTAButton data-testid="destCreateButton" onClick={onOpenTypeDialog}>New Destination</TableCTAButton>
        )}
      />
    </div>
  );
}
