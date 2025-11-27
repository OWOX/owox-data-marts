import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@owox/ui/components/badge';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { ScheduleDisplay } from '../ScheduleDisplay/ScheduleDisplay';
import { ScheduledTriggerActionsCell } from './ScheduledTriggerActionsCell';
import { StatusLabel, StatusTypeEnum } from '../../../../../shared/components/StatusLabel';
import { ScheduledTriggerRunTarget } from './ScheduledTriggerRunTarget';
import { ToggleColumnsHeader } from '../../../../../shared/components/Table';

interface ScheduledTriggerTableColumnsProps {
  onEditTrigger: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
}

export function getScheduledTriggerColumns({
  onEditTrigger,
  onDeleteTrigger,
}: ScheduledTriggerTableColumnsProps): (ColumnDef<ScheduledTrigger> & {
  meta?: { hidden?: boolean; title?: string };
})[] {
  return [
    {
      accessorKey: 'type',
      size: 150, // fixed width in px
      header: 'Trigger Type',
      cell: ({ row }) => {
        const type = row.getValue('type');
        const label = type === ScheduledTriggerType.REPORT_RUN ? 'Report Run' : 'Connector Run';
        return <Badge variant='outline'>{label}</Badge>;
      },
      meta: { title: 'Trigger Type' },
    },
    {
      accessorKey: 'triggerConfig',
      size: 35, // responsive width in %
      header: 'Run Target',
      cell: ({ row }) => <ScheduledTriggerRunTarget trigger={row.original} />,
      meta: { title: 'Run Target' },
    },
    {
      accessorKey: 'cronExpression',
      size: 20, // responsive width in %
      header: 'Schedule',
      cell: ({ row }) => {
        const cronExpression = row.getValue('cronExpression');
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
      meta: { title: 'Schedule' },
    },
    {
      accessorKey: 'nextRun',
      size: 15, // responsive width in %
      header: 'Next Run',
      cell: ({ row }) => {
        const nextRunTimestamp = row.original.nextRun;
        return (
          <div className='text-muted-foreground text-sm'>
            {nextRunTimestamp ? (
              <RelativeTime date={new Date(nextRunTimestamp)} />
            ) : (
              'Not scheduled'
            )}
          </div>
        );
      },
      meta: { title: 'Next Run' },
    },
    {
      accessorKey: 'lastRun',
      size: 15, // responsive width in %
      header: 'Last Run',
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
      meta: { title: 'Last Run' },
    },
    {
      accessorKey: 'isActive',
      size: 15, // responsive width in %
      header: 'Trigger Status',
      cell: ({ row }) => {
        const isActive: boolean = row.getValue('isActive');
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
      meta: { title: 'Trigger Status' },
    },
    {
      id: 'actions',
      size: 80, // fixed width in pixels
      header: ({ table }) => <ToggleColumnsHeader table={table} />,
      cell: ({ row }) => (
        <ScheduledTriggerActionsCell
          trigger={row.original}
          onEditTrigger={onEditTrigger}
          onDeleteTrigger={onDeleteTrigger}
        />
      ),
      meta: { title: 'Actions' },
    },
  ];
}
