import { useState } from 'react';
import { type Row } from '@tanstack/react-table';
import { useBaseTable } from '../../../../../shared/hooks';
import {
  BaseTable,
  TableColumnSearch,
  TableCTAButton,
} from '../../../../../shared/components/Table';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { NO_PERMISSION_MESSAGE, usePermissions } from '../../../../../app/permissions';
import type { CustomConnectorListItemDto } from '../../../../connector-builder/shared/api/types';
import { getConnectorColumns, ConnectorColumnKey } from './columns/columns';
import { EmptyConnectorsState } from './EmptyConnectorsState';

interface ConnectorsTableProps {
  data: CustomConnectorListItemDto[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function ConnectorsTable({ data, onOpen, onCreate, onDelete }: ConnectorsTableProps) {
  // The kebab "Delete" only requests deletion; the actual onDelete fires after confirm.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Creating and deleting a connector are both @Auth(Role.editor()) on the backend, and
  // canCreate/canDelete are the app's own admin-or-editor primitive — the same hierarchy the
  // backend applies. Without this a viewer got buttons that could only end in a 403.
  const { canCreate, canDelete } = usePermissions();

  const columns = getConnectorColumns({
    onOpen,
    onDelete: id => {
      setPendingDeleteId(id);
    },
    canDelete,
  });

  const { table } = useBaseTable<CustomConnectorListItemDto>({
    data,
    columns,
    storageKeyPrefix: 'connectors-list',
    enableRowSelection: false,
  });

  const handleRowClick = (row: Row<CustomConnectorListItemDto>, e: React.MouseEvent) => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('.actions-cell') || e.target.closest('[role="menuitem"]'))
    ) {
      return;
    }
    onOpen(row.original.id);
  };

  if (!data.length) {
    return (
      <div className='dm-card'>
        <EmptyConnectorsState onCreate={onCreate} canCreate={canCreate} />
      </div>
    );
  }

  return (
    <div className='dm-card' data-testid='connectorsTable'>
      <BaseTable
        tableId='connectors-table'
        table={table}
        onRowClick={handleRowClick}
        ariaLabel='Connectors table'
        paginationProps={{ displaySelected: false }}
        renderToolbarLeft={() => (
          <TableColumnSearch
            table={table}
            columnId={ConnectorColumnKey.TITLE}
            placeholder='Search'
          />
        )}
        renderToolbarRight={() => (
          <Tooltip>
            {/* A disabled button fires no pointer events, so the wrapper is what the tooltip hangs on. */}
            <TooltipTrigger asChild>
              <div className='inline-flex'>
                <TableCTAButton onClick={onCreate} disabled={!canCreate}>
                  New connector
                </TableCTAButton>
              </div>
            </TooltipTrigger>
            {!canCreate && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
          </Tooltip>
        )}
      />
      <ConfirmationDialog
        open={pendingDeleteId !== null}
        onOpenChange={open => {
          if (!open) setPendingDeleteId(null);
        }}
        title='Delete connector'
        description='Are you sure you want to delete this connector? Data marts that use it will fail to run. This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id) onDelete(id);
        }}
      />
    </div>
  );
}
