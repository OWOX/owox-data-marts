import { useCallback, useMemo } from 'react';
import type { Row } from '@tanstack/react-table';
import { BaseTable, TableCTAButton } from '../../../../shared/components/Table';
import { useBaseTable } from '../../../../shared/hooks';
import { getApiKeysColumns } from './columns';
import type { ProjectMemberApiKey } from '../../types';

interface ApiKeysTableProps {
  keys: ProjectMemberApiKey[];
  onCreateKey: () => void;
  onOpenDetails: (key: ProjectMemberApiKey) => void;
  onEditName: (key: ProjectMemberApiKey) => void;
  onRevoke: (key: ProjectMemberApiKey) => void;
}

export function ApiKeysTable({
  keys,
  onCreateKey,
  onOpenDetails,
  onEditName,
  onRevoke,
}: ApiKeysTableProps) {
  const columns = useMemo(
    () => getApiKeysColumns({ onEditName, onRevoke }),
    [onEditName, onRevoke]
  );

  const { table } = useBaseTable<ProjectMemberApiKey>({
    data: keys,
    columns,
    storageKeyPrefix: 'my-api-keys',
    enableRowSelection: false,
  });

  const handleRowClick = useCallback(
    (row: Row<ProjectMemberApiKey>, e: React.MouseEvent) => {
      if (
        e.target instanceof Element &&
        (e.target.closest('button') ||
          e.target.closest('a') ||
          e.target.closest('[role="button"]') ||
          e.target.closest('[role="menuitem"]') ||
          e.target.closest('[role="checkbox"]'))
      ) {
        return;
      }

      onOpenDetails(row.original);
    },
    [onOpenDetails]
  );

  return (
    <div className='dm-card'>
      <BaseTable
        tableId='my-api-keys'
        table={table}
        onRowClick={handleRowClick}
        renderToolbarLeft={() => <div />}
        renderToolbarRight={() => (
          <TableCTAButton onClick={onCreateKey}>Create API Key</TableCTAButton>
        )}
      />
    </div>
  );
}
