import { type ColumnDef } from '@tanstack/react-table';
import { UserReference } from '../../../../../../shared/components/UserReference';
import type { DataMartListItem } from '../../../model/types';
import { type DataMartStatusInfo, getDataMartStatusType } from '../../../../shared';
import { StatusLabel } from '../../../../../../shared/components/StatusLabel';
import { DataStorageType } from '../../../../../data-storage';
import { DataStorageTypeModel } from '../../../../../data-storage/shared/types/data-storage-type.model.ts';
import { DataMartActionsCell, DataMartHealthStatusCell } from '../components';
import { DataMartDefinitionType } from '../../../../shared';
import { DataMartDefinitionTypeModel } from '../../../../shared/types/data-mart-definition-type.model.ts';
import { DataMartColumnKey } from './columnKeys.ts';
import { dataMartColumnLabels } from './columnLabels.ts';
import type { ConnectorDefinitionConfig } from '../../../../edit';
import type { ConnectorListItem } from '../../../../../connectors/shared/model/types/connector';
import { RawBase64Icon } from '../../../../../../shared';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../shared/components/Table';
import { getCachedHealthStatus } from '../../../../shared/services/data-mart-health-status.service';
import { getHealthStatusSortRank } from '../../../utils/data-mart-health-status.utils';

interface DataMartTableColumnsProps {
  onDeleteSuccess?: () => void;
  connectors?: ConnectorListItem[];
}

export const getDataMartColumns = ({
  onDeleteSuccess,
  connectors = [],
}: DataMartTableColumnsProps = {}): ColumnDef<DataMartListItem>[] => [
  {
    id: DataMartColumnKey.HEALTH_STATUS,
    size: 40,
    enableResizing: false,
    accessorFn: row => {
      const cachedHealthStatus = getCachedHealthStatus(row.id);
      return getHealthStatusSortRank({
        dataMartStatus: row.status.code,
        healthStatus: cachedHealthStatus?.healthStatus,
      });
    },
    sortingFn: 'basic',
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.HEALTH_STATUS]}
      </SortableHeader>
    ),
    cell: ({ row }) => <DataMartHealthStatusCell row={row} />,
  },
  {
    accessorKey: DataMartColumnKey.TITLE,
    size: 320,
    minSize: 200,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.TITLE]}
      </SortableHeader>
    ),
    cell: ({ row }) => <div className='w-full'>{row.getValue('title')}</div>,
  },
  {
    accessorFn: row => {
      const type = row.definitionType;
      if (type === DataMartDefinitionType.CONNECTOR) {
        const definition = row.definition as ConnectorDefinitionConfig;
        const connector = connectors.find(c => c.name === definition.connector.source.name);
        return connector?.displayName ?? connector?.name ?? 'Unknown';
      } else {
        const { displayName } = DataMartDefinitionTypeModel.getInfo(type);
        return displayName;
      }
    },
    id: DataMartColumnKey.DEFINITION_TYPE,
    size: 220,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.DEFINITION_TYPE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const type = row.original.definitionType;
      switch (type) {
        case DataMartDefinitionType.CONNECTOR: {
          const definition = row.original.definition as ConnectorDefinitionConfig;
          const connector = connectors.find(c => c.name === definition.connector.source.name);
          return (
            <div className='text-muted-foreground flex items-center gap-2'>
              {connector?.logoBase64 && <RawBase64Icon base64={connector.logoBase64} size={18} />}
              {connector?.displayName ?? 'Unknown'}
            </div>
          );
        }
        default: {
          const { displayName, icon: Icon } = DataMartDefinitionTypeModel.getInfo(type);
          return (
            <div className='text-muted-foreground flex items-center gap-2'>
              <Icon className='h-4 w-4' />
              {displayName}
            </div>
          );
        }
      }
    },
  },
  {
    accessorKey: DataMartColumnKey.STORAGE_TYPE,
    size: 220,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.STORAGE_TYPE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const type = row.getValue<DataStorageType>('storageType');
      const storageTitle = row.original.storageTitle;
      const { displayName, icon: Icon } = DataStorageTypeModel.getInfo(type);

      const label = storageTitle ?? displayName;

      return (
        <div className='text-muted-foreground flex items-center gap-2'>
          <Icon size={18} />
          {label}
        </div>
      );
    },
  },
  {
    accessorKey: DataMartColumnKey.CREATED_AT,
    size: 140,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.CREATED_AT]}
      </SortableHeader>
    ),
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
    id: DataMartColumnKey.CREATED_BY_USER,
    size: 220,
    accessorFn: row => {
      const u = row.createdByUser;
      return u?.fullName ?? u?.email;
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.CREATED_BY_USER]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const userProjection = row.original.createdByUser;
      if (userProjection) {
        return <UserReference userProjection={userProjection} />;
      }
      return <div className='text-muted-foreground'>—</div>;
    },
  },
  {
    accessorKey: DataMartColumnKey.STATUS,
    size: 120,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.STATUS]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const statusInfo = row.getValue<DataMartStatusInfo>('status');

      return (
        <StatusLabel type={getDataMartStatusType(statusInfo.code)} variant='ghost' showIcon={false}>
          {statusInfo.displayName}
        </StatusLabel>
      );
    },
  },
  {
    accessorKey: DataMartColumnKey.TRIGGERS_COUNT,
    size: 100,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.TRIGGERS_COUNT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const triggersCountValue =
        row.getValue<number>('triggersCount') > 0 ? row.getValue<string>('triggersCount') : '—';
      return <div className='text-muted-foreground'>{triggersCountValue}</div>;
    },
  },
  {
    accessorKey: DataMartColumnKey.REPORTS_COUNT,
    size: 100,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataMartColumnLabels[DataMartColumnKey.REPORTS_COUNT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const reportsCountValue =
        row.getValue<number>('reportsCount') > 0 ? row.getValue<string>('reportsCount') : '—';
      return <div className='text-muted-foreground'>{reportsCountValue}</div>;
    },
  },
  {
    id: 'actions',
    size: 50,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => <DataMartActionsCell row={row} onDeleteSuccess={onDeleteSuccess} />,
  },
];
