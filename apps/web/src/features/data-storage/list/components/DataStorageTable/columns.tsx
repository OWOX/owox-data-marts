import { type ColumnDef } from '@tanstack/react-table';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model';
import { DataStorageType } from '../../../shared';
import { DataStorageActionsCell } from './DataStorageActionsCell';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../shared/components/Table';

export interface DataStorageTableItem {
  id: string;
  title: string;
  type: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
}

interface DataStorageColumnsProps {
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
}

export const getDataStorageColumns = ({
  onViewDetails,
  onEdit,
  onDelete,
}: DataStorageColumnsProps = {}): ColumnDef<DataStorageTableItem>[] => [
  {
    accessorKey: 'title',
    size: 50, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
    cell: ({ row }) => {
      const title = row.getValue<string>('title');
      return <div>{title}</div>;
    },
  },
  {
    accessorKey: 'type',
    size: 30, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Type</SortableHeader>,
    cell: ({ row }) => {
      const type = row.getValue<DataStorageType>('type');
      const { displayName, icon: Icon } = DataStorageTypeModel.getInfo(type);

      return (
        <div className='text-muted-foreground flex items-center gap-2'>
          <Icon size={18} />
          {displayName}
        </div>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    size: 20, // responsive width in %
    sortDescFirst: true,
    header: ({ column }) => <SortableHeader column={column}>Created at</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue<Date>('createdAt');
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);

      return <div className='text-muted-foreground'>{formatted}</div>;
    },
  },
  {
    id: 'actions',
    size: 80, // fixed width in pixels
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <DataStorageActionsCell
        id={row.original.id}
        onViewDetails={onViewDetails}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ),
  },
];
