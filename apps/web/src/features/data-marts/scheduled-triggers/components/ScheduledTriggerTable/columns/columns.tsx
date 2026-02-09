import { ScheduledTriggerType } from '../../../enums';
import type { ScheduledTrigger } from '../../../model/scheduled-trigger.model';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@owox/ui/components/badge';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { ScheduleDisplay } from '../../ScheduleDisplay/ScheduleDisplay';
import { ScheduledTriggerActionsCell } from '../ScheduledTriggerActionsCell';
import { StatusLabel, StatusTypeEnum } from '../../../../../../shared/components/StatusLabel';
import { ScheduledTriggerRunTarget } from '../ScheduledTriggerRunTarget';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../shared/components/Table';
import { ScheduledTriggerColumnLabels } from './columnLabels';
import { ScheduledTriggerColumnKey } from './columnKeys';

interface ScheduledTriggerTableColumnsProps {
  onEditTrigger: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
}

export const getScheduledTriggerColumns = ({
  onEditTrigger,
  onDeleteTrigger,
}: ScheduledTriggerTableColumnsProps): ColumnDef<ScheduledTrigger>[] => [
  {
    accessorKey: ScheduledTriggerColumnKey.TYPE,
    meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TYPE] },
    size: 180,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TYPE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const type = row.getValue(ScheduledTriggerColumnKey.TYPE);
      const label = type === ScheduledTriggerType.REPORT_RUN ? 'Report Run' : 'Connector Run';
      return <Badge variant='outline'>{label}</Badge>;
    },
  },
  {
    accessorKey: ScheduledTriggerColumnKey.TRIGGER_CONFIG,
    meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TRIGGER_CONFIG] },
    size: 320,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.TRIGGER_CONFIG]}
      </SortableHeader>
    ),
    cell: ({ row }) => <ScheduledTriggerRunTarget trigger={row.original} />,
  },
  {
    accessorKey: ScheduledTriggerColumnKey.CRON_EXPRESSION,
    meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.CRON_EXPRESSION] },
    size: 300,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.CRON_EXPRESSION]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const cronExpression = row.getValue(ScheduledTriggerColumnKey.CRON_EXPRESSION);
      const timeZone = row.original.timeZone;
      const isActive = row.getValue('isActive');
      return (
        <ScheduleDisplay
          cronExpression={String(cronExpression)}
          timeZone={timeZone}
          isEnabled={isActive as boolean}
        />
      );
    },
  },
  {
    accessorKey: ScheduledTriggerColumnKey.NEXT_RUN,
    meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.NEXT_RUN] },
    size: 220,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.NEXT_RUN]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const nextRunTimestamp = row.original.nextRun;
      return (
        <div className='text-muted-foreground text-sm'>
          {nextRunTimestamp ? <RelativeTime date={new Date(nextRunTimestamp)} /> : 'Not scheduled'}
        </div>
      );
    },
  },
  {
    accessorKey: ScheduledTriggerColumnKey.LAST_RUN,
    meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.LAST_RUN] },
    size: 150,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.LAST_RUN]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const lastRunTimestamp = row.original.lastRun;
      return (
        <div className='text-sm'>
          {lastRunTimestamp ? (
            <RelativeTime date={new Date(lastRunTimestamp)} />
          ) : (
            <span className='text-muted-foreground text-sm'>Never run</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: ScheduledTriggerColumnKey.IS_ACTIVE,
    meta: { title: ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.IS_ACTIVE] },
    size: 180,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ScheduledTriggerColumnLabels[ScheduledTriggerColumnKey.IS_ACTIVE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const isActive: boolean = row.getValue(ScheduledTriggerColumnKey.IS_ACTIVE);
      return (
        <StatusLabel
          type={isActive ? StatusTypeEnum.SUCCESS : StatusTypeEnum.NEUTRAL}
          variant='ghost'
          showIcon={false}
        >
          {isActive ? 'Enabled' : 'Disabled'}
        </StatusLabel>
      );
    },
  },
  {
    id: 'actions',
    size: 80,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <ScheduledTriggerActionsCell
        trigger={row.original}
        onEditTrigger={onEditTrigger}
        onDeleteTrigger={onDeleteTrigger}
      />
    ),
  },
];
