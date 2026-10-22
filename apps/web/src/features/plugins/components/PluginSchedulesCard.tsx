import { Button } from '@owox/ui/components/button';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { CalendarClock } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../shared/components/CollapsibleCard';
import { StatusLabel, StatusTypeEnum } from '../../../shared/components/StatusLabel';
import { useProjectRoute } from '../../../shared/hooks';
import { formatDateShort } from '../../../utils/date-formatters';
import { describeCron } from '../describeCron';
import { usePluginSchedules } from '../hooks/usePluginSchedules';
import { lastRunSummary, runStatusLabel, SCHEDULE_DISABLED_REASON_TEXT } from '../scheduleLabels';
import type { PluginScheduleSummary } from '../types';

const RUN_TYPE: Record<string, StatusTypeEnum> = {
  SUCCEEDED: StatusTypeEnum.SUCCESS,
  FAILED: StatusTypeEnum.ERROR,
  TIMED_OUT: StatusTypeEnum.ERROR,
  QUEUED: StatusTypeEnum.INFO,
  RUNNING: StatusTypeEnum.INFO,
};

// An overview: pause, resume, delete and the runs are under Plugins → Schedules, where each row links.
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
  const { schedules, enabled, hasData, isPending, isError, refetch } =
    usePluginSchedules(installationId);

  if (!enabled || ((!hasBackend || uninstalled) && schedules.length === 0 && !isError)) {
    return null;
  }

  const manageHref = (scheduleId?: string) =>
    scope(`/plugins/schedules?plugin=${pluginId}${scheduleId ? `&schedule=${scheduleId}` : ''}`);

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
          <p className='text-muted-foreground text-sm'>This plugin has no schedules.</p>
        ) : (
          <>
            {loadError}
            <p className='text-muted-foreground mb-3 text-sm'>
              {uninstalled
                ? 'These schedules run again if the plugin is restored.'
                : overview(schedules)}
            </p>
            <ul className='@container divide-y'>
              {schedules.map(schedule => (
                // One grid template per row, so the columns line up across rows.
                <li
                  key={schedule.id}
                  className='flex flex-col gap-1 py-2 text-sm first:pt-0 last:pb-0 @4xl:grid @4xl:grid-cols-[minmax(0,1fr)_14rem_12rem_16rem] @4xl:items-center @4xl:gap-4'
                >
                  <Link
                    to={manageHref(schedule.id)}
                    className='min-w-0 truncate font-medium hover:underline'
                  >
                    {schedule.name ?? schedule.action}
                  </Link>
                  {/* Stacked and labelled while the card is too narrow for columns. */}
                  <div className='text-muted-foreground flex flex-col gap-1 @4xl:contents'>
                    <span>{describeCron(schedule.cron) ?? <code>{schedule.cron}</code>}</span>
                    <span className='inline-flex items-center gap-1 whitespace-nowrap'>
                      <span className='@4xl:hidden'>Next run:</span>
                      <NextRun schedule={schedule} />
                    </span>
                    <span className='inline-flex items-center gap-1 whitespace-nowrap'>
                      <span className='@4xl:hidden'>Last run:</span>
                      <LastRun schedule={schedule} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CollapsibleCardContent>
      <CollapsibleCardFooter
        right={
          <Button asChild variant='link' size='sm'>
            <Link to={manageHref()}>Manage schedules</Link>
          </Button>
        }
      />
    </CollapsibleCard>
  );
}

/** "2 active · 1 paused · 1 disabled". */
function overview(schedules: PluginScheduleSummary[]): string {
  const disabled = schedules.filter(
    item =>
      !item.enabled && item.disabledReason !== null && item.disabledReason !== 'PAUSED_BY_ADMIN'
  ).length;
  const active = schedules.filter(item => item.enabled);
  const counts: [number, string][] = [
    [active.length, 'active'],
    [schedules.length - active.length - disabled, 'paused'],
    [disabled, 'disabled'],
  ];
  return counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${String(count)} ${label}`)
    .join(' · ');
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
      <RelativeTime date={new Date(nextRunAt)} />
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
    <span className='inline-flex items-center gap-1'>
      <StatusLabel type={RUN_TYPE[lastRun.status] ?? StatusTypeEnum.NEUTRAL}>
        {runStatusLabel(lastRun.status)}
      </StatusLabel>
      {lastRun.finishedAt && (
        <span className='text-muted-foreground'>
          · <RelativeTime date={new Date(lastRun.finishedAt)} />
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
