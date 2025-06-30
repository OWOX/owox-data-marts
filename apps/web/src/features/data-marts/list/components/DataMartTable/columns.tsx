import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader } from './SortableHeader.tsx';
import type { DataMartListItem } from '../../model/types';
import { type DataMartStatusInfo, getDataMartStatusType } from '../../../shared';
import { Badge } from '@owox/ui/components/badge';
import { StatusLabel } from '../../../../../shared/components/StatusLabel';
import { DataStorageType } from '../../../../data-storage';
import { DataStorageTypeModel } from '../../../../data-storage/shared/types/data-storage-type.model.ts';
import { DataMartActionsCell } from './DataMartActionsCell';
import { ToggleColumnsHeader } from './ToggleColumnsHeader';

interface DataMartTableColumnsProps {
  onDeleteSuccess?: () => void;
}

export const getDataMartColumns = ({
  onDeleteSuccess,
}: DataMartTableColumnsProps = {}): ColumnDef<DataMartListItem>[] => [
  {
    accessorKey: 'title',
    size: 60, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
    cell: ({ row }) => <div>{row.getValue('title')}</div>,
  },
  {
    accessorKey: 'storageType',
    size: 10, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Storage</SortableHeader>,
    cell: ({ row }) => {
      const type = row.getValue<DataStorageType>('storageType');
      const { displayName, icon: Icon } = DataStorageTypeModel.getInfo(type);

      return (
        <Badge title={displayName} variant={'secondary'} className='flex items-center gap-2'>
          <Icon />
        </Badge>
      );
    },
  },
  {
    accessorKey: 'status',
    size: 15, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
    cell: ({ row }) => {
      const statusInfo = row.getValue<DataMartStatusInfo>('status');

      return (
        <StatusLabel type={getDataMartStatusType(statusInfo.code)} variant='subtle'>
          {statusInfo.displayName}
        </StatusLabel>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    size: 15, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Created at</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue<Date>('createdAt');
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);

      return <div>{formatted}</div>;
    },
  },
  {
    id: 'actions',
    size: 80, // fixed width in pixels
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => <DataMartActionsCell row={row} onDeleteSuccess={onDeleteSuccess} />,
  },
];
