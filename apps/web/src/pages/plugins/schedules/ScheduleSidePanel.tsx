import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Button } from '@owox/ui/components/button';
import {
  SheetHeaderAction,
  SheetHeaderActionButton,
} from '@owox/ui/components/common/sheet-header-action';
import { FormActions, FormItem, FormLayout, FormSection } from '@owox/ui/components/form';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { ExternalLink, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  lastRunSummary,
  SCHEDULE_DISABLED_REASON_TEXT,
  SCHEDULE_OWNER_NOT_MEMBER_TEXT,
  type ProjectPluginSchedule,
  type ScheduleOperation,
} from '../../../features/plugins';
import { UserReference } from '../../../shared/components/UserReference';
import { timezoneService } from '../../../services/timezone.service';
import { formatDateShort } from '../../../utils/date-formatters';
import { describeCron } from './describeCron';
import { ScheduleStatusBadge } from './ScheduleStatusBadge';
import { scheduleStatus } from './scheduleStatus';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-1'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='text-sm [overflow-wrap:anywhere]'>{children}</dd>
    </div>
  );
}

/** A read-only value in a card, labelled as the fields of the other sheets. */
function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-sm font-medium'>{label}</span>
      <div className='text-sm [overflow-wrap:anywhere]'>{children}</div>
    </div>
  );
}

/** A "How do I…?" answer under a card's value, as in the trigger and destination forms. */
function Hint({ question, children }: { question: string; children: ReactNode }) {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value='hint'>
        <AccordionTrigger>{question}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** One schedule's settings and actions; dates in the schedule's own zone. */
export function ScheduleSidePanel({
  schedule,
  disabled,
  pluginHref,
  runsHref,
  onClose,
  onChange,
  onDelete,
}: {
  schedule: ProjectPluginSchedule;
  disabled: boolean;
  pluginHref: string;
  runsHref: string;
  onClose: () => void;
  onChange: (operation: Exclude<ScheduleOperation, 'delete'>) => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const removed = schedule.installationState === 'uninstalled';
  const zoned = (date: string | null) => formatDateShort(date, { timeZone: schedule.timeZone });
  const summary = describeCron(schedule.cron);
  const canToggle = schedule.canManage && !removed;

  return (
    <Sheet
      open
      onOpenChange={open => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader className='pr-12'>
          <SheetTitle className='[overflow-wrap:anywhere]'>
            {schedule.name ?? schedule.action}
          </SheetTitle>
          <div className='flex w-full min-w-0 items-center gap-4'>
            <SheetDescription className='min-w-0 truncate'>{schedule.pluginName}</SheetDescription>
            {/* As in the row menu: only the owner's own install can restore a removed plugin. */}
            {!removed && (
              <SheetHeaderAction className='shrink-0'>
                <SheetHeaderActionButton
                  onClick={() => {
                    void navigate(pluginHref);
                  }}
                >
                  <ExternalLink className='h-3.5 w-3.5' />
                  Open plugin
                </SheetHeaderActionButton>
              </SheetHeaderAction>
            )}
          </div>
        </SheetHeader>
        <FormLayout>
          <FormSection title='General' name='plugin-schedule-general'>
            <FormItem>
              <Value label='Status'>
                <span className='flex flex-wrap items-center gap-2'>
                  <ScheduleStatusBadge schedule={schedule} />
                  {schedule.disabledReason ? (
                    <span className='text-muted-foreground'>
                      {SCHEDULE_DISABLED_REASON_TEXT[schedule.disabledReason]}
                    </span>
                  ) : (
                    scheduleStatus(schedule) === 'owner-not-member' && (
                      <span className='text-muted-foreground'>
                        {SCHEDULE_OWNER_NOT_MEMBER_TEXT}
                      </span>
                    )
                  )}
                </span>
              </Value>
              <Hint question='Why would a schedule stop?'>
                <p>
                  OWOX disables a schedule when the plugin&apos;s current version no longer has its
                  action, or when its settings no longer match that action. While its owner is not a
                  project member or their account is locked, it skips its runs. Resume first checks
                  the owner and the current version.
                </p>
                <p className='mt-2'>
                  Removing the plugin stops its schedules; restoring the plugin brings them back.
                </p>
              </Hint>
            </FormItem>
            <FormItem>
              <Value label='Action'>
                <code>{schedule.action}</code>
              </Value>
            </FormItem>
          </FormSection>
          <FormSection title='Schedule' name='plugin-schedule-timing'>
            <FormItem>
              <Value label='Runs'>
                {summary !== null && <div>{summary}</div>}
                <code className='text-muted-foreground block text-xs'>
                  {timezoneService.getTimezoneDisplayName(schedule.timeZone)}
                </code>
                <code className='text-muted-foreground text-xs'>{schedule.cron}</code>
              </Value>
              <Hint question='How do I change when it runs?'>
                The plugin sets its schedules: open it to change when a schedule runs or what it
                does. Here you can pause, resume or delete it.
              </Hint>
            </FormItem>
            <FormItem>
              <Value label='Next run'>{zoned(schedule.nextRunAt)}</Value>
              <Value label='Last run'>
                {schedule.lastRun ? lastRunSummary(schedule.lastRun, schedule.timeZone) : 'Never'}
              </Value>
              <Link to={runsHref} className='text-primary text-sm hover:underline'>
                View runs
              </Link>
            </FormItem>
          </FormSection>
          <FormSection title='Ownership' defaultOpen={false} name='plugin-schedule-ownership'>
            <FormItem>
              <Value label='Owner'>
                {schedule.owner ? <UserReference userProjection={schedule.owner} /> : '—'}
              </Value>
              <Hint question='Whose access does a run use?'>
                The plugin installation owner&apos;s, whoever resumed the schedule. If the owner
                leaves the project or their account is locked, the schedule stops.
              </Hint>
            </FormItem>
          </FormSection>
          <FormSection title='Details' defaultOpen={false} name='plugin-schedule-details'>
            <FormItem>
              <Value label='Created'>{zoned(schedule.createdAt)}</Value>
              <Value label='Modified'>{zoned(schedule.modifiedAt)}</Value>
            </FormItem>
          </FormSection>
        </FormLayout>
        {schedule.canManage && (
          <FormActions>
            {canToggle && (
              <Button
                variant='outline'
                disabled={disabled}
                onClick={() => {
                  onChange(schedule.enabled ? 'pause' : 'resume');
                }}
              >
                {schedule.enabled ? 'Pause' : 'Resume'}
              </Button>
            )}
            {/* Outlined, as Delete in the Relationship sheet: the sheet has no primary action. */}
            <Button
              variant='outline'
              className='border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15'
              disabled={disabled}
              onClick={onDelete}
            >
              <Trash2 className='size-4' />
              Delete
            </Button>
          </FormActions>
        )}
      </SheetContent>
    </Sheet>
  );
}
