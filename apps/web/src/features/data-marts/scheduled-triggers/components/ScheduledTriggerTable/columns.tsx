import { ScheduledTriggerType } from '../../enums';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@owox/ui/components/badge';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { ScheduleDisplay } from '../ScheduleDisplay/ScheduleDisplay';
import { ToggleColumnsHeader } from './ToggleColumnsHeader';
import { ScheduledTriggerActionsCell } from './ScheduledTriggerActionsCell';
import { ReportHoverCard } from '../../../reports/shared/components/ReportHoverCard';

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
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('type');
        const label = type === ScheduledTriggerType.REPORT_RUN ? 'Report' : 'Connector';
        return (
          <Badge variant='outline' className='px-2 py-0.5 text-xs'>
            {label}
          </Badge>
        );
      },
      meta: { title: 'Type' },
      size: 100, // Set a fixed width to make the column take minimal space
    },
    {
      accessorKey: 'triggerConfig',
      header: 'Report',
      cell: ({ row }) => {
        const trigger = row.original;
        if (trigger.type === ScheduledTriggerType.REPORT_RUN && trigger.triggerConfig) {
          const config = trigger.triggerConfig;
          return <ReportHoverCard report={config.report}>{config.report.title}</ReportHoverCard>;
        } else {
          return <div className='text-muted-foreground text-sm'>—</div>;
        }
      },
      meta: { title: 'Target' },
    },
    {
      accessorKey: 'cronExpression',
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
      header: 'Next Run',
      cell: ({ row }) => {
        const nextRunTimestamp = row.original.nextRun;
        return (
          <div className='text-sm'>
            {nextRunTimestamp ? (
              <RelativeTime date={new Date(nextRunTimestamp)} />
            ) : (
              <span className='text-muted-foreground text-sm'>Not scheduled</span>
            )}
          </div>
        );
      },
      meta: { title: 'Next Run' },
    },
    {
      accessorKey: 'lastRun',
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
      header: 'Status',
      cell: ({ row }) => {
        const isActive: boolean = row.getValue('isActive');
        return (
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        );
      },
      meta: { title: 'Status' },
    },
    {
      id: 'actions',
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
