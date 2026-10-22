import { Button } from '@owox/ui/components/button';
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
import { lastRunSummary, SCHEDULE_DISABLED_REASON_TEXT } from '../scheduleLabels';
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
            <ul className='divide-y'>
              {schedules.map(schedule => (
                <li
                  key={schedule.id}
                  className='flex items-center gap-4 py-2 text-sm first:pt-0 last:pb-0'
                >
                  <div className='flex min-w-0 flex-1 flex-col gap-x-4 sm:flex-row sm:items-center'>
                    <Link
                      to={manageHref(schedule.id)}
                      className='min-w-0 truncate font-medium hover:underline sm:flex-1'
                    >
                      {schedule.name ?? schedule.action}
                    </Link>
                    <span className='text-muted-foreground'>
                      {describeCron(schedule.cron) ?? <code>{schedule.cron}</code>}
                    </span>
                  </div>
                  {/* A fixed column, so the schedules line up whether a row shows an icon or a word. */}
                  <span className='flex w-16 shrink-0 justify-end'>
                    <ScheduleState schedule={schedule} />
                  </span>
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

/** "2 active · 1 paused · next run …", the next run in its schedule's own zone. */
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
  const next = active.reduce<PluginScheduleSummary | null>(
    (soonest, item) =>
      item.nextRunAt &&
      (!soonest?.nextRunAt || Date.parse(item.nextRunAt) < Date.parse(soonest.nextRunAt))
        ? item
        : soonest,
    null
  );
  return [
    ...counts.filter(([count]) => count > 0).map(([count, label]) => `${String(count)} ${label}`),
    ...(next?.nextRunAt
      ? [`next run ${formatDateShort(next.nextRunAt, { timeZone: next.timeZone })}`]
      : []),
  ].join(' · ');
}

function ScheduleState({ schedule }: { schedule: PluginScheduleSummary }) {
  const { lastRun, disabledReason } = schedule;
  if (!schedule.enabled) {
    const disabled = disabledReason !== null && disabledReason !== 'PAUSED_BY_ADMIN';
    return withHint(
      <StatusLabel type={disabled ? StatusTypeEnum.ERROR : StatusTypeEnum.NEUTRAL} showIcon={false}>
        {disabled ? 'Disabled' : 'Paused'}
      </StatusLabel>,
      disabledReason && SCHEDULE_DISABLED_REASON_TEXT[disabledReason]
    );
  }
  const summary = lastRun
    ? `Last run: ${lastRunSummary(lastRun, schedule.timeZone)}`
    : 'Not run yet';
  return withHint(
    lastRun ? (
      <StatusLabel type={RUN_TYPE[lastRun.status] ?? StatusTypeEnum.NEUTRAL}>
        <span className='sr-only'>{summary}</span>
      </StatusLabel>
    ) : (
      <span className='text-muted-foreground'>
        <span aria-hidden='true'>—</span>
        <span className='sr-only'>{summary}</span>
      </span>
    ),
    summary
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
