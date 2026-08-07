import { useCallback, useMemo } from 'react';
import type { Row } from '@tanstack/react-table';
import { BaseTable, TableCTAButton } from '../../../../shared/components/Table';
import { useBaseTable } from '../../../../shared/hooks';
import { getLicenseKeysColumns } from './columns';
import type { LicenseKey } from '../../types';

interface LicenseKeysTableProps {
  keys: LicenseKey[];
  onCreateKey: () => void;
  onOpenDetails: (key: LicenseKey) => void;
  onEditName: (key: LicenseKey) => void;
  onRevoke: (key: LicenseKey) => void;
}

export function LicenseKeysTable({
  keys,
  onCreateKey,
  onOpenDetails,
  onEditName,
  onRevoke,
}: LicenseKeysTableProps) {
  const columns = useMemo(
    () => getLicenseKeysColumns({ onEditName, onRevoke }),
    [onEditName, onRevoke]
  );

  const { table } = useBaseTable<LicenseKey>({
    data: keys,
    columns,
    storageKeyPrefix: 'project-license-keys',
    enableRowSelection: false,
  });

  const handleRowClick = useCallback(
    (row: Row<LicenseKey>, e: React.MouseEvent) => {
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
        tableId='project-license-keys'
        table={table}
        onRowClick={handleRowClick}
        renderToolbarLeft={() => <div />}
        renderToolbarRight={() => (
          <TableCTAButton onClick={onCreateKey}>Create license key</TableCTAButton>
        )}
      />
    </div>
  );
}
