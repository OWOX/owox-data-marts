import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { CopyButton } from '@owox/ui/components/common/copy-button';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { Blocks, CalendarClock, ChevronDown, SquarePlay, Zap } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { runStatusLabel, type PluginRun } from '../../../features/plugins';
import { useClipboard } from '../../../hooks/useClipboard';
import { UserReference } from '../../../shared/components/UserReference';
import { formatDateShort, formatDateTime, formatDuration } from '../../../utils/date-formatters';
import { Field } from './ScheduleSidePanel';

// A run has no zone of its own, so exact times show in the viewer's, named.
const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const GREY = 'bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400';
const RED = 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400';

// The colours of the Data Mart run badges, so both run histories read alike.
const STATUS_CLASS: Record<string, string> = {
  QUEUED: GREY,
  RUNNING: 'text-primary bg-primary/10',
  SUCCEEDED: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
  FAILED: RED,
  CANCELLED: GREY,
  TIMED_OUT: RED,
};

function sourceText(run: PluginRun): string {
  if (run.trigger !== 'schedule') {
    return 'Plugin page';
  }
  return `Schedule · ${run.scheduleName ?? 'Deleted schedule'}`;
}

function RunStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant='secondary'
      className={cn('inline-flex items-center gap-1.5', STATUS_CLASS[status] ?? GREY)}
    >
      {status === 'RUNNING' && (
        <span className='relative flex h-1.5 w-1.5' aria-hidden>
          <span className='bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75' />
          <span className='bg-primary relative inline-flex h-1.5 w-1.5 rounded-full' />
        </span>
      )}
      {runStatusLabel(status)}
    </Badge>
  );
}

/** One run; expanded, its metadata and error. Input and result never reach the browser. */
export function PluginRunRow({
  run,
  isAdmin,
  expanded,
  linked,
  pluginHref,
  scheduleHref,
  onToggle,
  onCancel,
}: {
  run: PluginRun;
  /** Only an admin sees whose run it is: everyone else sees their own runs only. */
  isAdmin: boolean;
  expanded: boolean;
  linked: boolean;
  pluginHref: string;
  /** Null when the run has no schedule, or its schedule is gone. */
  scheduleHref: string | null;
  onToggle: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { copiedSection, handleCopy } = useClipboard();

  useEffect(() => {
    if (expanded) {
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [expanded]);

  const label = runStatusLabel(run.status);
  const now = new Date();
  const exact = (date: string | null) => formatDateShort(date, { timeZone: BROWSER_ZONE });
  const took = run.startedAt
    ? formatDuration(new Date(run.startedAt), run.finishedAt ? new Date(run.finishedAt) : now)
    : null;
  const waited = run.queuedAt
    ? formatDuration(new Date(run.queuedAt), new Date(run.startedAt ?? run.finishedAt ?? now))
    : '—';

  const scheduled = run.trigger === 'schedule';

  return (
    <li ref={ref} className='dm-card-block !gap-1'>
      <div className='h-4 min-w-0 leading-4'>
        <Link
          to={pluginHref}
          className='text-muted-foreground hover:text-primary inline-flex h-4 max-w-full items-center gap-1.5 text-xs leading-4 font-medium transition-colors'
        >
          <Blocks className='h-3.5 w-3.5 shrink-0' aria-hidden />
          <span className='truncate'>{run.pluginName}</span>
        </Link>
      </div>

      <div className='flex cursor-pointer items-center justify-between gap-4' onClick={onToggle}>
        <div className='flex min-w-0 flex-1 items-center gap-3'>
          <Zap className='text-brand-blue-500 shrink-0' size={18} aria-hidden />
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1'>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className='text-foreground flex shrink-0 items-center font-mono text-sm font-medium whitespace-nowrap'>
                  {run.startedAt ? (
                    <RelativeTime date={new Date(run.startedAt)} />
                  ) : (
                    <>
                      Queued&nbsp;
                      <RelativeTime date={new Date(run.queuedAt ?? run.createdAt)} />
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className='space-y-1'>
                  <div>Queued at: {formatDateTime(run.queuedAt)}</div>
                  <div>Started at: {formatDateTime(run.startedAt)}</div>
                  <div>Finished at: {formatDateTime(run.finishedAt)}</div>
                  {took && <div>Duration: {took}</div>}
                </div>
              </TooltipContent>
            </Tooltip>
            <div className='text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-sm'>
              {scheduled ? (
                <CalendarClock className='shrink-0' size={18} aria-hidden />
              ) : (
                <SquarePlay className='shrink-0' size={18} aria-hidden />
              )}
              <div className='inline-flex min-w-0 flex-wrap items-center gap-x-2'>
                <span>
                  <code>{run.action}</code> run {scheduled ? 'on schedule' : 'from plugin page'}
                </span>
                {isAdmin && run.owner && (
                  <>
                    {' by '}
                    <UserReference userProjection={run.owner} />
                  </>
                )}
                {scheduled && (
                  <>
                    {' • '}
                    {scheduleHref !== null && run.scheduleName !== null ? (
                      <Link
                        to={scheduleHref}
                        className='hover:text-primary truncate'
                        onClick={event => {
                          event.stopPropagation();
                        }}
                      >
                        {run.scheduleName}
                      </Link>
                    ) : (
                      <span className='truncate'>{run.scheduleName ?? 'Deleted schedule'}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          {linked && <Badge variant='outline'>Linked run</Badge>}
          <RunStatusBadge status={run.status} />
          <Button
            variant='ghost'
            size='icon'
            className='size-6'
            aria-expanded={expanded}
            aria-label={`${label} run of ${run.action}`}
            onClick={event => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronDown
              className={`text-muted-foreground size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className='border-border bg-muted/30 mt-4 flex flex-col gap-4 border-t p-4'>
          <div className='flex items-center gap-2'>
            <h3 className='text-sm font-medium'>Run ID: {run.id}</h3>
            <CopyButton
              text={run.id}
              section='run ID'
              copiedSection={copiedSection}
              onCopy={handleCopy}
              iconOnly
            />
          </div>
          <dl className='grid gap-3 sm:grid-cols-2'>
            <Field label='Status'>{label}</Field>
            {(run.errorCode !== null || run.errorMessage !== null || run.errorMessageCleared) && (
              <Field label='Error'>
                {run.errorCode && <code className='mr-2'>{run.errorCode}</code>}
                {run.errorMessageCleared ? (
                  <span className='text-muted-foreground'>Message cleared after 24 hours</span>
                ) : (
                  run.errorMessage
                )}
              </Field>
            )}
            <Field label='Source'>{sourceText(run)}</Field>
            <Field label='Plugin version'>
              {run.pluginVersion ? `v${run.pluginVersion}` : '—'}
            </Field>
            <Field label='Queued at'>{exact(run.queuedAt)}</Field>
            <Field label='Started at'>{exact(run.startedAt)}</Field>
            <Field label='Finished at'>{exact(run.finishedAt)}</Field>
            <Field label='Time in queue'>{waited}</Field>
            <Field label='Duration'>{took ?? '—'}</Field>
            <Field label='Time limit'>
              {run.timeLimitSeconds === null
                ? '—'
                : formatDuration(new Date(0), new Date(run.timeLimitSeconds * 1000))}
            </Field>
            {isAdmin && (
              <Field label='Owner'>
                {run.owner ? <UserReference userProjection={run.owner} /> : '—'}
              </Field>
            )}
          </dl>
          <div className='flex flex-wrap gap-2'>
            {run.canCancel && (
              <Button variant='outline' size='sm' onClick={onCancel}>
                Cancel run
              </Button>
            )}
            {scheduleHref !== null && (
              <Button asChild variant='outline' size='sm'>
                <Link to={scheduleHref}>Open schedule</Link>
              </Button>
            )}
            <Button asChild variant='outline' size='sm'>
              <Link to={pluginHref}>Open plugin</Link>
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
