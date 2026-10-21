import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../shared/components/CollapsibleCard';
import { ConfirmationDialog } from '../../../shared/components/ConfirmationDialog/ConfirmationDialog';
import { useProjectRoute } from '../../../shared/hooks';
import { formatDateShort } from '../../../utils/date-formatters';
import { usePluginSchedules } from '../hooks/usePluginSchedules';
import { lastRunSummary, SCHEDULE_DISABLED_REASON_TEXT } from '../scheduleLabels';
import type { PluginScheduleSummary } from '../types';

// A plugin without a backend can still hold schedules from an earlier version, so only an empty list hides it.
// An uninstalled plugin's schedules can only be deleted: they run again if the plugin is restored.
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
  const { schedules, enabled, hasData, isPending, isError, refetch, isChanging, change } =
    usePluginSchedules(installationId);
  const [deleteTarget, setDeleting] = useState<PluginScheduleSummary | null>(null);
  // The current row, so a rename since the click shows; none once the schedule is gone.
  const deleting = schedules.find(item => item.id === deleteTarget?.id) ?? null;

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

  const confirmDelete = async (target: PluginScheduleSummary) => {
    if (await change('delete', target.id)) {
      setDeleting(null);
    }
  };

  return (
    <>
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
              {uninstalled && (
                <p className='text-muted-foreground mb-3 text-sm'>
                  These schedules run again if the plugin is restored.
                </p>
              )}
              <ul className='divide-y'>
                {schedules.map(schedule => (
                  <ScheduleRow
                    key={schedule.id}
                    schedule={schedule}
                    canToggle={!uninstalled}
                    disabled={isChanging}
                    onToggle={() => void change(schedule.enabled ? 'pause' : 'resume', schedule.id)}
                    onDelete={() => {
                      setDeleting(schedule);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </CollapsibleCardContent>
        <CollapsibleCardFooter
          right={
            <Button asChild variant='link' size='sm'>
              <Link to={scope(`/plugins/schedules?plugin=${pluginId}`)}>View all</Link>
            </Button>
          }
        />
      </CollapsibleCard>

      {deleting && (
        <ConfirmationDialog
          open
          onOpenChange={open => {
            if (!open && !isChanging) {
              setDeleting(null);
            }
          }}
          title='Delete this schedule?'
          description={
            <p className='break-words'>
              <span className='font-medium [overflow-wrap:anywhere]'>
                {deleting.name ?? deleting.action}
              </span>{' '}
              stops running and is removed. This cannot be undone.
            </p>
          }
          confirmLabel={isChanging ? 'Deleting…' : 'Delete'}
          cancelLabel='Cancel'
          confirmDisabled={isChanging}
          cancelDisabled={isChanging}
          showCloseButton={!isChanging}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </>
  );
}

function ScheduleRow({
  schedule,
  canToggle,
  disabled,
  onToggle,
  onDelete,
}: {
  schedule: PluginScheduleSummary;
  canToggle: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const title = schedule.name ?? schedule.action;
  const toggleLabel = schedule.enabled ? 'Pause' : 'Resume';
  return (
    <li className='flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between'>
      <div className='flex min-w-0 flex-col gap-1'>
        <span className='truncate text-sm font-medium'>{title}</span>
        {schedule.name && (
          <span className='text-muted-foreground truncate text-sm'>{schedule.action}</span>
        )}
        <span className='text-muted-foreground flex flex-wrap gap-2 text-sm'>
          <span className='font-mono'>{schedule.cron}</span>
          <span>{schedule.timeZone}</span>
        </span>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          {schedule.enabled ? (
            schedule.nextRunAt ? (
              <span>
                Next run {formatDateShort(schedule.nextRunAt, { timeZone: schedule.timeZone })}
              </span>
            ) : null
          ) : schedule.disabledReason ? (
            <>
              <Badge
                variant={
                  schedule.disabledReason === 'PAUSED_BY_ADMIN' ? 'secondary' : 'destructive'
                }
              >
                {schedule.disabledReason === 'PAUSED_BY_ADMIN' ? 'Paused' : 'Disabled'}
              </Badge>
              <span className='text-muted-foreground'>
                {SCHEDULE_DISABLED_REASON_TEXT[schedule.disabledReason]}
              </span>
            </>
          ) : (
            <Badge variant='secondary'>Paused</Badge>
          )}
        </div>
        <span className='text-muted-foreground text-sm'>{describeLastRun(schedule)}</span>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        {canToggle && (
          <Button
            variant='outline'
            size='sm'
            disabled={disabled}
            onClick={onToggle}
            aria-label={`${toggleLabel} ${title}`}
          >
            {toggleLabel}
          </Button>
        )}
        <Button
          variant='ghost'
          size='sm'
          disabled={disabled}
          onClick={onDelete}
          aria-label={`Delete ${title}`}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

function describeLastRun({ lastRun, timeZone }: PluginScheduleSummary): string {
  if (!lastRun) {
    return 'Not run yet';
  }
  return `Last run: ${lastRunSummary(lastRun, timeZone)}`;
}
