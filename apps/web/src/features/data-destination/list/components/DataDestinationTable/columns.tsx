import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader } from './SortableHeader';
import { DataDestinationTypeModel } from '../../../shared';
import { DataDestinationType } from '../../../shared';
import { DataDestinationActionsCell } from './DataDestinationActionsCell';
import { ToggleColumnsHeader } from './ToggleColumnsHeader';

export interface DataDestinationTableItem {
  id: string;
  title: string;
  type: DataDestinationType;
  createdAt: Date;
  modifiedAt: Date;
}

interface DataDestinationColumnsProps {
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
}

export const getDataDestinationColumns = ({
  onEdit,
  onDelete,
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
      <DataDestinationActionsCell id={row.original.id} onEdit={onEdit} onDelete={onDelete} />
    ),
  },
];
