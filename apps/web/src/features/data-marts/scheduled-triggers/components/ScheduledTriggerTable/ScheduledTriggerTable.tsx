import { useState, useCallback, useMemo } from 'react';
import { getScheduledTriggerColumns } from './columns';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';
import { useBaseTable } from '../../../../../shared/hooks';
import { BaseTable } from '../../../../../shared/components/Table';

interface ScheduledTriggerTableProps {
  triggers: ScheduledTrigger[];
  dataMartId: string;
  onEditTrigger: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
}

export function ScheduledTriggerTable({
  triggers,
  dataMartId,
  onEditTrigger,
  onDeleteTrigger,
}: ScheduledTriggerTableProps) {
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);

  const handleCloseFormSheet = useCallback(() => {
    setIsFormSheetOpen(false);
  }, []);

  const handleDeleteClick = useCallback(
    (id: string) => {
      onDeleteTrigger(id);
    },
    [onDeleteTrigger]
  );

  const columns = useMemo(
    () =>
      getScheduledTriggerColumns({
        onEditTrigger,
        onDeleteTrigger: handleDeleteClick,
      }),
    [onEditTrigger, handleDeleteClick]
  );

  const { table } = useBaseTable<ScheduledTrigger>({
    data: triggers,
    columns,
    storageKeyPrefix: 'data-mart-scheduled-triggers',
    defaultSortingColumn: 'type',
    enableRowSelection: false,
  });

  // Generate unique IDs for accessibility
  const tableId = 'scheduled-triggers-table';

  return (
    <>
      <BaseTable
        tableId={tableId}
        table={table}
        ariaLabel='Scheduled Triggers'
        showPagination={true}
        paginationProps={{
          displaySelected: false,
        }}
        renderEmptyState={() => (
          <span role='status' aria-live='polite'>
            No scheduled triggers yet. Create a trigger to automate data updates
          </span>
        )}
        onRowClick={row => {
          onEditTrigger(row.original.id);
        }}
      />
      <ScheduledTriggerFormSheet
        isOpen={isFormSheetOpen}
        onClose={handleCloseFormSheet}
        dataMartId={dataMartId}
      />
    </>
  );
}
