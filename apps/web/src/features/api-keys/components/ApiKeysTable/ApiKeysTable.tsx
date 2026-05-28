import { useMemo } from 'react';
import { BaseTable, TableCTAButton } from '../../../../shared/components/Table';
import { useBaseTable } from '../../../../shared/hooks';
import { getApiKeysColumns } from './columns';
import type { ProjectMemberApiKey } from '../../types';

interface ApiKeysTableProps {
  keys: ProjectMemberApiKey[];
  onCreateKey: () => void;
  onEditName: (key: ProjectMemberApiKey) => void;
  onRevoke: (key: ProjectMemberApiKey) => void;
}

export function ApiKeysTable({ keys, onCreateKey, onEditName, onRevoke }: ApiKeysTableProps) {
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

  return (
    <div className='dm-card'>
      <BaseTable
        tableId='my-api-keys'
        table={table}
        renderToolbarLeft={() => <div />}
        renderToolbarRight={() => (
          <TableCTAButton onClick={onCreateKey}>Create API Key</TableCTAButton>
        )}
      />
    </div>
  );
}
