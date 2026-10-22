import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { useMemo, type MouseEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../shared/components/CollapsibleCard';
import { StatusLabel, StatusTypeEnum } from '../../../shared/components/StatusLabel';
import { BaseTable, SortableHeader } from '../../../shared/components/Table';
import { useBaseTable, useProjectRoute } from '../../../shared/hooks';
import { timezoneService } from '../../../services/timezone.service';
import { formatDateShort } from '../../../utils/date-formatters';
import { useUser } from '../../idp/hooks/useAuthState';
import { describeCron } from '../describeCron';
import { usePluginSchedules } from '../hooks/usePluginSchedules';
import {
  lastRunSortKey,
  lastRunSummary,
  runStatusLabel,
  SCHEDULE_DISABLED_REASON_TEXT,
} from '../scheduleLabels';
import type { PluginScheduleSummary } from '../types';

// The card shows the schedules that ran last; the rest are a link away, under Plugins → Schedules.
const CARD_ROWS = 10;

const SCHEDULES_DOCS_URL =
  'https://docs.owox.com/docs/plugins/authoring-guide/?utm_source=owox_data_marts&utm_medium=plugin_page&utm_campaign=no_plugin_schedules#run-actions-on-a-schedule';

const RUN_TYPE: Record<string, StatusTypeEnum> = {
  SUCCEEDED: StatusTypeEnum.SUCCESS,
  FAILED: StatusTypeEnum.ERROR,
  TIMED_OUT: StatusTypeEnum.ERROR,
  QUEUED: StatusTypeEnum.INFO,
  RUNNING: StatusTypeEnum.INFO,
};

// An overview: pause, resume, delete and the runs are under Plugins → Schedules, which each row opens.
// A plugin without a backend can still hold schedules from an earlier version, so only an empty list hides it.
export function PluginSchedulesCard({
  pluginId,
  installationId,
  hasBackend,
  uninstalled = false,
}: {
  pluginId: string;
  installationId: string;
  hasBackend: boolean;
  uninstalled?: boolean;
}) {
  const { scope } = useProjectRoute();
  const navigate = useNavigate();
  const user = useUser();
  const { schedules, enabled, hasData, isPending, isError, refetch } =
    usePluginSchedules(installationId);
  const columns = useMemo(() => scheduleColumns(pluginId), [pluginId]);
  // The ten are picked first, so sorting a column reorders them rather than picking others.
  const latest = useMemo(
    () =>
      [...schedules]
        .sort((a, b) => (lastRunSortKey(b) ?? '').localeCompare(lastRunSortKey(a) ?? ''))
        .slice(0, CARD_ROWS),
    [schedules]
  );
  const { table } = useBaseTable<PluginScheduleSummary>({
    data: latest,
    columns,
    storageKeyPrefix: `plugin-schedules-card-${pluginId}`,
    defaultSortingColumn: 'lastRun',
    defaultSortingDesc: true,
    // Pagination stays hidden, so the page is the whole card.
    defaultPageSize: CARD_ROWS,
    getRowId: item => item.id,
  });

  if (!enabled || ((!hasBackend || uninstalled) && schedules.length === 0 && !isError)) {
    return null;
  }

  const loadError = isError && (
    <div role='alert' className='flex items-center gap-3 text-sm'>
      <span className='text-muted-foreground'>Could not load schedules.</span>
      <Button
        variant='outline'
        size='sm'
        onClick={() => {
          void refetch();
        }}
      >
        Retry
      </Button>
    </div>
  );

  return (
    <CollapsibleCard collapsible name='plugin-schedules'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle
          icon={CalendarClock}
          tooltip='When this plugin runs its backend actions on its own'
        >
          Schedules
        </CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>
      <CollapsibleCardContent>
        {isError && !hasData ? (
          loadError
        ) : isPending ? (
          <p role='status' className='text-muted-foreground text-sm'>
            Loading…
          </p>
        ) : schedules.length === 0 ? (
          <div className='flex flex-col gap-3'>
            {loadError}
            <p className='text-muted-foreground text-sm'>
              This plugin has no schedules. A plugin adds them itself:{' '}
              <ExternalAnchor href={SCHEDULES_DOCS_URL}>Run actions on a schedule</ExternalAnchor>
            </p>
          </div>
        ) : (
          <>
            {loadError}
            {uninstalled && (
              <p className='text-muted-foreground mb-3 text-sm'>
                These schedules run again if the plugin is restored.
              </p>
            )}
            <BaseTable
              tableId='plugin-schedules-card-table'
              table={table}
              ariaLabel='Schedules of this plugin'
              showPagination={false}
              onRowClick={row => {
                void navigate(scope(manageSearch(pluginId, row.original.id)));
              }}
            />
          </>
        )}
      </CollapsibleCardContent>
      <CollapsibleCardFooter
        right={
          schedules.length > CARD_ROWS && (
            <Link
              // The card holds the user's own schedules, and an admin's full list holds everyone's.
              to={scope(`${manageSearch(pluginId)}${user ? `&owner=${user.id}` : ''}`)}
              className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm'
            >
              View all {schedules.length} schedules
              <ArrowRight className='size-4' aria-hidden='true' />
            </Link>
          )
        }
      />
    </CollapsibleCard>
  );
}

const manageSearch = (pluginId: string, scheduleId?: string) =>
  `/plugins/schedules?plugin=${pluginId}${scheduleId ? `&schedule=${scheduleId}` : ''}`;

// The row opens the same panel; the link keeps it reachable by keyboard.
const keepRowClick = (event: MouseEvent) => {
  event.stopPropagation();
};

function ScheduleLink({
  pluginId,
  schedule,
}: {
  pluginId: string;
  schedule: PluginScheduleSummary;
}) {
  const { scope } = useProjectRoute();
  return (
    <Link
      to={scope(manageSearch(pluginId, schedule.id))}
      className='font-medium [overflow-wrap:anywhere] hover:underline'
      onClick={keepRowClick}
    >
      {schedule.name ?? schedule.action}
    </Link>
  );
}

function scheduleColumns(pluginId: string): ColumnDef<PluginScheduleSummary>[] {
  return [
    {
      id: 'name',
      accessorFn: item => item.name ?? item.action,
      size: 200,
      meta: { title: 'Name' },
      header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
      cell: ({ row }) => <ScheduleLink pluginId={pluginId} schedule={row.original} />,
    },
    {
      id: 'schedule',
      // By what the cell reads, not the raw cron.
      accessorFn: item => describeCron(item.cron) ?? item.cron,
      size: 190,
      meta: { title: 'Schedule' },
      header: ({ column }) => <SortableHeader column={column}>Schedule</SortableHeader>,
      cell: ({ row }) =>
        withHint(
          <span className='text-muted-foreground'>
            {describeCron(row.original.cron) ?? <code>{row.original.cron}</code>}
          </span>,
          timezoneService.getTimezoneDisplayName(row.original.timeZone)
        ),
    },
    {
      id: 'nextRun',
      accessorFn: item => item.nextRunAt ?? undefined,
      sortingFn: 'basic',
      sortUndefined: 'last',
      size: 170,
      meta: { title: 'Next run' },
      header: ({ column }) => <SortableHeader column={column}>Next run</SortableHeader>,
      cell: ({ row }) => <NextRun schedule={row.original} />,
    },
    {
      id: 'lastRun',
      accessorFn: lastRunSortKey,
      sortingFn: 'basic',
      sortUndefined: 'last',
      size: 260,
      meta: { title: 'Last run' },
      header: ({ column }) => <SortableHeader column={column}>Last run</SortableHeader>,
      cell: ({ row }) => <LastRun schedule={row.original} />,
    },
  ];
}

// The next run in words, its time in the schedule's own zone; Paused or Disabled, with the reason, in its place.
function NextRun({ schedule }: { schedule: PluginScheduleSummary }) {
  const { disabledReason, nextRunAt } = schedule;
  if (!schedule.enabled) {
    const disabled = disabledReason !== null && disabledReason !== 'PAUSED_BY_ADMIN';
    return withHint(
      <StatusLabel type={disabled ? StatusTypeEnum.ERROR : StatusTypeEnum.NEUTRAL} showIcon={false}>
        {disabled ? 'Disabled' : 'Paused'}
      </StatusLabel>,
      disabledReason && SCHEDULE_DISABLED_REASON_TEXT[disabledReason]
    );
  }
  if (!nextRunAt) {
    return <span className='text-muted-foreground'>—</span>;
  }
  return withHint(
    <span className='text-muted-foreground'>
      <RelativeTime date={new Date(nextRunAt)} timeZone={schedule.timeZone} showTitle={false} />
    </span>,
    `Next run: ${formatDateShort(nextRunAt, { timeZone: schedule.timeZone })}`
  );
}

function LastRun({ schedule }: { schedule: PluginScheduleSummary }) {
  const { lastRun } = schedule;
  if (!lastRun) {
    return <span className='text-muted-foreground'>Not run yet</span>;
  }
  return withHint(
    <span className='inline-flex items-center gap-1 whitespace-nowrap'>
      <StatusLabel type={RUN_TYPE[lastRun.status] ?? StatusTypeEnum.NEUTRAL}>
        {runStatusLabel(lastRun.status)}
      </StatusLabel>
      {lastRun.finishedAt && (
        <span className='text-muted-foreground'>
          ·{' '}
          <RelativeTime
            date={new Date(lastRun.finishedAt)}
            timeZone={schedule.timeZone}
            showTitle={false}
          />
        </span>
      )}
    </span>,
    `Last run: ${lastRunSummary(lastRun, schedule.timeZone)}`
  );
}

function withHint(label: ReactElement, hint: string | null) {
  if (!hint) {
    return label;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className='inline-flex'>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
