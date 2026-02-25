import { useState, useMemo } from 'react';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { DataStorageDetailsDialog } from '../DataStorageDetailsDialog';
import { type DataStorageTableItem } from './columns';
import { useBaseTable } from '../../../../../shared/hooks';
import {
  BaseTable,
  TableColumnSearch,
  TableCTAButton,
} from '../../../../../shared/components/Table';
import { EmptyDataStoragesState } from './EmptyDataStoragesState';
import { DataStorageColumnKey } from './columns/columnKeys';
import { usePersistentFilters } from '../../../../../shared/hooks/usePersistentFilters';
import { applyFiltersToData } from '../../../../../shared/components/TableFilters/filter-utils';
import {
  buildDataStorageTableFilters,
  dataStorageFilterAccessors,
  type DataStorageFilterKey,
} from './DataStorageTableFilters.config';
import { DataStorageTableFilters } from './DataStorageTableFilters';
import { useParams } from 'react-router-dom';

interface DataStorageTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onOpenTypeDialog?: () => void;
}

export function DataStorageTable<TData, TValue>({
  columns,
  data,
  onEdit,
  onOpenTypeDialog,
}: DataStorageTableProps<TData, TValue>) {
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedDataStorage] = useState<DataStorageTableItem | null>(null);
  const { projectId = '' } = useParams<{ projectId: string }>();
  const tableId = 'data-storage-table';

  const filtersConfig = useMemo(
    () => buildDataStorageTableFilters(data as DataStorageTableItem[]),
    [data]
  );

  const { appliedState, apply, clear } = usePersistentFilters<DataStorageFilterKey>({
    projectId,
    tableId,
    urlParam: 'filters',
    config: filtersConfig,
  });

  const filteredData = useMemo(
    () =>
      applyFiltersToData<DataStorageFilterKey, DataStorageTableItem>(
        data as DataStorageTableItem[],
        appliedState,
        dataStorageFilterAccessors
      ) as TData[],
    [data, appliedState]
  );

  // Initialize table with shared hook
  const { table } = useBaseTable<TData>({
    data: filteredData,
    columns: columns as ColumnDef<TData>[],
    storageKeyPrefix: 'data-storage-list',
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

  if (!data.length) {
    return (
      <div className='dm-card'>
        <EmptyDataStoragesState onOpenTypeDialog={onOpenTypeDialog} />
      </div>
    );
  }

  return (
    <div className='dm-card'>
      {selectedDataStorage && (
        <DataStorageDetailsDialog
          isOpen={isDetailsDialogOpen}
          onClose={() => {
            setIsDetailsDialogOpen(false);
          }}
          id={selectedDataStorage.id}
        />
      )}
      <BaseTable
        tableId={tableId}
        table={table}
        onRowClick={handleRowClick}
        ariaLabel='Storages table'
        paginationProps={{ displaySelected: false }}
        renderToolbarLeft={() => (
          <>
            <DataStorageTableFilters
              appliedState={appliedState}
              config={filtersConfig}
              onApply={apply}
              onClear={clear}
            />
            <TableColumnSearch
              table={table}
              columnId={DataStorageColumnKey.TITLE}
              placeholder='Search'
            />
          </>
        )}
        renderToolbarRight={() => (
          <TableCTAButton onClick={onOpenTypeDialog}>New Storage</TableCTAButton>
        )}
      />
    </div>
  );
}
