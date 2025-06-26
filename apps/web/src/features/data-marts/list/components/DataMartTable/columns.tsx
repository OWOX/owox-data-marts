import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader } from './SortableHeader.tsx';
import type { DataMartListItem } from '../../model/types';
import type { DataMartStatusInfo } from '../../../shared';
import { Badge } from '@owox/ui/components/badge';
import { DataMartStatus } from '../../../shared';
import { DataStorageType } from '../../../../data-storage';
import { DataStorageTypeModel } from '../../../../data-storage/shared/types/data-storage-type.model.ts';
import { DataMartActionsCell } from './DataMartActionsCell';

interface DataMartTableColumnsProps {
  onDeleteSuccess?: () => void;
}

export const getDataMartColumns = ({
  onDeleteSuccess,
}: DataMartTableColumnsProps = {}): ColumnDef<DataMartListItem>[] => [
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <div className='group/header min-w-64'>
        <SortableHeader column={column}>Title</SortableHeader>
      </div>
    ),
    cell: ({ row }) => <div className='overflow-hidden text-ellipsis'>{row.getValue('title')}</div>,
  },
  {
    accessorKey: 'storageType',
    header: ({ column }) => (
      <div className='group/header whitespace-nowrap'>
        <SortableHeader column={column}>Storage</SortableHeader>
      </div>
    ),
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
    header: ({ column }) => (
      <div className='group/header whitespace-nowrap'>
        <SortableHeader column={column}>Status</SortableHeader>
      </div>
    ),
    cell: ({ row }) => {
      const statusInfo = row.getValue<DataMartStatusInfo>('status');
      const getVariant = (status: DataMartStatusInfo['code']) => {
        switch (status) {
          case DataMartStatus.DRAFT:
            return 'outline';
          case DataMartStatus.PUBLISHED:
            return 'secondary';
          default:
            return 'default';
        }
      };

      return <Badge variant={getVariant(statusInfo.code)}>{statusInfo.displayName}</Badge>;
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <div className='group/header whitespace-nowrap'>
        <SortableHeader column={column}>Created at</SortableHeader>
      </div>
    ),
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
    cell: ({ row }) => <DataMartActionsCell row={row} onDeleteSuccess={onDeleteSuccess} />,
  },
];
