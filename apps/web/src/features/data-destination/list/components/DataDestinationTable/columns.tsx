import { type ColumnDef } from '@tanstack/react-table';
import { type DataDestination, DataDestinationTypeModel } from '../../../shared';
import { DataDestinationType } from '../../../shared';
import { DataDestinationActionsCell } from './DataDestinationActionsCell';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../shared/components/Table';

export interface DataDestinationTableItem {
  id: string;
  title: string;
  type: DataDestinationType;
  createdAt: Date;
  modifiedAt: Date;
  credentials?: DataDestination['credentials'];
}

interface DataDestinationColumnsProps {
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onRotateSecretKey?: (id: string) => void;
}

export const getDataDestinationColumns = ({
  onEdit,
  onDelete,
  onRotateSecretKey,
}: DataDestinationColumnsProps = {}): ColumnDef<DataDestinationTableItem>[] => [
  {
    accessorKey: 'title',
    size: 50, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
    cell: ({ row }) => {
      const title = row.getValue<string>('title');
      return <div className='overflow-hidden text-ellipsis'>{title}</div>;
    },
  },
  {
    accessorKey: 'type',
    size: 30, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Type</SortableHeader>,
    cell: ({ row }) => {
      const type = row.getValue<DataDestinationType>('type');
      const { displayName, icon: Icon } = DataDestinationTypeModel.getInfo(type);

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
      <DataDestinationActionsCell
        id={row.original.id}
        type={row.original.type}
        credentials={row.original.credentials}
        onEdit={onEdit}
        onDelete={onDelete}
        onRotateSecretKey={onRotateSecretKey}
      />
    ),
  },
];
