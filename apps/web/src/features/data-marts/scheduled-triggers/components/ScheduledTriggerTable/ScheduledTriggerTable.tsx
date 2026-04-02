import { useState, useCallback, useMemo } from 'react';
import { getScheduledTriggerColumns } from './columns';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerFormSheet } from '../ScheduledTriggerFormSheet/ScheduledTriggerFormSheet';
import { useBaseTable } from '../../../../../shared/hooks';
import { BaseTable } from '../../../../../shared/components/Table';
import { Button } from '@owox/ui/components/button';
import { CalendarClock, Plus } from 'lucide-react';

interface ScheduledTriggerTableProps {
  triggers: ScheduledTrigger[];
  dataMartId: string;
  onEditTrigger: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
  onRequestCreate?: () => void;
}

export function ScheduledTriggerTable({
  triggers,
  dataMartId,
  onEditTrigger,
  onDeleteTrigger,
  onRequestCreate,
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
      <div data-testid='triggerTable'>
        <BaseTable
          tableId={tableId}
          table={table}
          ariaLabel='Scheduled Triggers'
          showPagination={true}
          paginationProps={{
            displaySelected: false,
          }}
          renderEmptyState={() => (
            <div
              className='flex flex-col items-center justify-center py-8 text-center'
              role='status'
              aria-live='polite'
              data-testid='triggerEmptyState'
            >
              <CalendarClock className='text-muted-foreground/50 mb-3 h-10 w-10' />
              <p className='text-muted-foreground mb-1 text-sm font-medium'>
                No scheduled triggers yet
              </p>
              <p className='text-muted-foreground/75 mb-4 text-xs'>
                Automate your data updates with scheduled runs
              </p>
              {onRequestCreate && (
                <Button variant='outline' size='sm' onClick={onRequestCreate}>
                  <Plus className='h-3.5 w-3.5' />
                  Add Trigger
                </Button>
              )}
            </div>
          )}
          onRowClick={row => {
            onEditTrigger(row.original.id);
          }}
        />
      </div>
      <ScheduledTriggerFormSheet
        isOpen={isFormSheetOpen}
        onClose={handleCloseFormSheet}
        dataMartId={dataMartId}
      />
    </>
  );
}
