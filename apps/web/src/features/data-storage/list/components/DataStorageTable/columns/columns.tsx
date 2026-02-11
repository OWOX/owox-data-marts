import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../shared/components/Table';
import { DataStorageHealthIndicator, DataStorageType } from '../../../../shared';
import { DataStorageTypeModel } from '../../../../shared/types/data-storage-type.model';
import { DataStorageActionsCell } from '../DataStorageActionsCell';
import { DataStorageColumnKey } from './columnKeys';
import { dataStorageColumnLabels } from './columnLabels';

export interface DataStorageTableItem {
  id: string;
  title: string;
  type: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
  dataMartsCount: number;
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
    id: DataStorageColumnKey.HEALTH,
    size: 15,
    enableResizing: false,
    enableSorting: false,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.HEALTH],
    },
    header: () => null,
    cell: ({ row }) => (
      <DataStorageHealthIndicator storageId={row.original.id} storageTitle={row.original.title} />
    ),
  },
  {
    accessorKey: DataStorageColumnKey.TITLE,
    size: 320,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.TITLE],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.TITLE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const title = row.getValue<string>(DataStorageColumnKey.TITLE);
      return <div>{title}</div>;
    },
  },
  {
    accessorKey: DataStorageColumnKey.TYPE,
    size: 220,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.TYPE],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.TYPE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const type = row.getValue<DataStorageType>(DataStorageColumnKey.TYPE);
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
    accessorKey: DataStorageColumnKey.CREATED_AT,
    size: 200,
    sortDescFirst: true,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.CREATED_AT],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.CREATED_AT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const date = row.getValue<Date>(DataStorageColumnKey.CREATED_AT);
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);

      return <div className='text-muted-foreground'>{formatted}</div>;
    },
  },
  {
    accessorKey: DataStorageColumnKey.DATA_MARTS_COUNT,
    size: 80,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.DATA_MARTS_COUNT],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.DATA_MARTS_COUNT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const count = row.getValue<string>(DataStorageColumnKey.DATA_MARTS_COUNT);
      return <div>{count}</div>;
    },
  },
  {
    id: 'actions',
    size: 80,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <DataStorageActionsCell
        id={row.original.id}
        type={row.original.type}
        onViewDetails={onViewDetails}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ),
  },
];
