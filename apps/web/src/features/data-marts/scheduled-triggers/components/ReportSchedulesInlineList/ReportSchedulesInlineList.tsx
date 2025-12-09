import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Label } from '@owox/ui/components/label';
import { Switch } from '@owox/ui/components/switch';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { ScheduleConfig } from '../ScheduleConfig/ScheduleConfig';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { scheduledTriggerService } from '../../services';
import { ScheduledTriggerType, TRIGGER_CONFIG_TYPES } from '../../enums';
import type { ScheduledTriggerResponseApiDto } from '../../model/api';
import type {
  ScheduledReportRunConfig,
  ScheduledTriggerConfig,
} from '../../model/trigger-config.types';

interface ReportSchedulesInlineListProps {
  dataMartId: string;
  reportId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}

export interface ReportSchedulesInlineListHandle {
  persist: (reportId: string) => Promise<void>;
}

interface ScheduleItem {
  id: string | null; // null => new (not yet created)
  cron: string;
  timezone: string;
  enabled: boolean;
  lastRun?: string | null;
  nextRun?: string | null;
}

function isReportRunConfig(
  config: ScheduledTriggerResponseApiDto['triggerConfig']
): config is ScheduledReportRunConfig {
  return config.type === TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN;
}

function isEqualSchedules(a: ScheduleItem[], b: ScheduleItem[]) {
  if (a.length !== b.length) return false;
  const sortKey = (x: ScheduleItem) =>
    `${x.id ?? 'new'}|${x.cron}|${x.timezone}|${x.enabled ? '1' : '0'}`;
  const aa = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const bb = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  for (let i = 0; i < aa.length; i++) {
    const x = aa[i];
    const y = bb[i];
    if (
      x.id !== y.id ||
      x.cron !== y.cron ||
      x.timezone !== y.timezone ||
      x.enabled !== y.enabled
    ) {
      return false;
    }
  }
  return true;
}

const defaultTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Defaults reused across the component
const DEFAULT_CRON = '0 9 * * *';

type EditableFields = Pick<ScheduleItem, 'cron' | 'timezone' | 'enabled'>;

// Map ScheduledTrigger API entity to local ScheduleItem
function mapTriggerToItem(t: ScheduledTriggerResponseApiDto): ScheduleItem {
  return {
    id: t.id,
    cron: t.cronExpression,
    timezone: t.timeZone,
    enabled: t.isActive,
    lastRun: t.lastRunTimestamp ?? null,
    nextRun: t.nextRunTimestamp ?? null,
  };
}

// Load and map all schedules for the given report
async function fetchReportScheduleItems(
  dataMartId: string,
  reportId: string
): Promise<ScheduleItem[]> {
  const triggers = await scheduledTriggerService.getScheduledTriggers(dataMartId);
  const reportTriggers = triggers.filter(
    t =>
      t.type === ScheduledTriggerType.REPORT_RUN &&
      isReportRunConfig(t.triggerConfig) &&
      t.triggerConfig.reportId === reportId
  );
  return reportTriggers.map(mapTriggerToItem);
}

export const ReportSchedulesInlineList = forwardRef<
  ReportSchedulesInlineListHandle,
  ReportSchedulesInlineListProps
>(({ dataMartId, reportId, onDirtyChange }, ref) => {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [initialItems, setInitialItems] = useState<ScheduleItem[]>([]);
  const loadedRef = useRef(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  // Load existing triggers for this report (edit mode only)
  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      if (!dataMartId || !reportId) {
        // create mode: no initial triggers
        setInitialItems([]);
        setItems([]);
        loadedRef.current = true;
        onDirtyChange?.(false);
        return;
      }
      try {
        const mapped = await fetchReportScheduleItems(dataMartId, reportId);
        if (!cancelled) {
          setInitialItems(mapped);
          setItems(mapped);
          loadedRef.current = true;
          onDirtyChange?.(false);
        }
      } catch {
        if (!cancelled) {
          setInitialItems([]);
          setItems([]);
          loadedRef.current = true;
          onDirtyChange?.(false);
        }
      }
    }
    void loadExisting();
    return () => {
      cancelled = true;
    };
  }, [dataMartId, reportId, onDirtyChange]);

  // Dirty tracking
  useEffect(() => {
    if (!loadedRef.current) return;
    onDirtyChange?.(!isEqualSchedules(items, initialItems));
  }, [items, initialItems, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      persist: async (finalReportId: string) => {
        // compute diff between initialItems and current items
        const initialWithIds = initialItems.filter(
          (i): i is ScheduleItem & { id: string } => i.id !== null
        );
        const currentWithIds = items.filter(
          (i): i is ScheduleItem & { id: string } => i.id !== null
        );

        const initialById = new Map(initialWithIds.map(i => [i.id, i]));
        const currentById = new Map(currentWithIds.map(i => [i.id, i]));
        // Deletes: only when the trigger is explicitly removed from the list
        for (const [id] of initialById.entries()) {
          const curr = currentById.get(id);
          if (!curr) {
            await scheduledTriggerService.deleteScheduledTrigger(dataMartId, id);
          }
        }

        // Updates: existing id present; persist any change in cron/timezone/enabled
        for (const [id, curr] of currentById.entries()) {
          const init = initialById.get(id);
          if (
            init &&
            (init.cron !== curr.cron ||
              init.timezone !== curr.timezone ||
              init.enabled !== curr.enabled)
          ) {
            await scheduledTriggerService.updateScheduledTrigger(dataMartId, id, {
              cronExpression: curr.cron,
              timeZone: curr.timezone,
              isActive: curr.enabled,
            });
          }
        }

        // Creates: items without id (regardless of enabled state)
        const newOnes = items.filter(i => !i.id);
        for (const it of newOnes) {
          await scheduledTriggerService.createScheduledTrigger(dataMartId, {
            type: ScheduledTriggerType.REPORT_RUN,
            cronExpression: it.cron,
            timeZone: it.timezone,
            isActive: it.enabled,
            triggerConfig: {
              type: TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN,
              reportId: finalReportId,
            } as ScheduledTriggerConfig,
          });
        }

        // After persist, refresh initial snapshot to current state
        try {
          const mapped: ScheduleItem[] = await fetchReportScheduleItems(dataMartId, finalReportId);
          setInitialItems(mapped);
          setItems(mapped);
          onDirtyChange?.(false);
        } catch {
          setInitialItems(items.map(i => ({ ...i })));
          onDirtyChange?.(false);
        }
      },
    }),
    [dataMartId, items, initialItems, onDirtyChange]
  );

  const addTrigger = () => {
    setItems(prev => [
      ...prev,
      {
        id: null,
        cron: DEFAULT_CRON,
        timezone: defaultTimezone(),
        enabled: true,
      },
    ]);
  };

  const removeTrigger = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, data: Partial<EditableFields>) => {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...data } : it)));
  };

  const hasItems = items.length > 0;

  return (
    <div className='flex flex-col gap-4'>
      {hasItems ? (
        items.map((it, idx) => (
          <div
            key={`${it.id ?? 'new'}:${String(idx)}`}
            className={
              'border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4'
            }
          >
            <div className='mb-2 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <Label htmlFor={`trigger-enabled-${String(idx)}`} className='text-sm font-normal'>
                  {it.enabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id={`trigger-enabled-${String(idx)}`}
                  checked={it.enabled}
                  onCheckedChange={checked => {
                    updateItem(idx, { enabled: checked });
                  }}
                />
              </div>
              <div>
                <Button
                  variant='ghost'
                  size='sm'
                  type='button'
                  aria-label='Delete trigger'
                  onClick={() => {
                    setDeleteIndex(idx);
                  }}
                >
                  <Trash2 className='h-4 w-4' aria-hidden='true' />
                </Button>
              </div>
            </div>
            <ScheduleConfig
              cron={it.cron}
              timezone={it.timezone}
              enabled={it.enabled}
              onChange={updateItem.bind(null, idx)}
              showPreview={false}
              showSaveButton={false}
              hideEnableSwitch
            />
            {(it.lastRun ?? it.nextRun) && (
              <div className='text-muted-foreground mt-3 grid gap-1 text-xs sm:grid-cols-2'>
                {it.lastRun && (
                  <div>
                    <span className='text-foreground/80 font-medium'>Last run: </span>
                    <RelativeTime date={new Date(it.lastRun)} />
                  </div>
                )}
                {it.nextRun && (
                  <div>
                    <span className='text-foreground/80 font-medium'>Next run: </span>
                    <RelativeTime date={new Date(it.nextRun)} />
                  </div>
                )}
              </div>
            )}
            {deleteIndex === idx && (
              <AlertDialog
                open={deleteIndex === idx}
                onOpenChange={open => {
                  if (!open) {
                    setDeleteIndex(null);
                  }
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete trigger?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action will remove this schedule from the report.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      onClick={() => {
                        setDeleteIndex(null);
                      }}
                    >
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className='bg-red-600 hover:bg-red-700'
                      onClick={() => {
                        removeTrigger(idx);
                        setDeleteIndex(null);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))
      ) : (
        <div
          className={
            'border-border flex flex-col gap-1.5 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4'
          }
        >
          <ScheduleConfig
            cron={DEFAULT_CRON}
            timezone={defaultTimezone()}
            enabled={false}
            showPreview={false}
            showSaveButton={false}
            hideEnableSwitch
          />
          <div className='gp-2 mt-3 flex items-center justify-between text-sm'>
            <Button variant='outline' type='button' onClick={addTrigger} size='sm'>
              + Add trigger
            </Button>
          </div>
        </div>
      )}

      {hasItems && (
        <div>
          <Button variant='outline' type='button' onClick={addTrigger}>
            + Add trigger
          </Button>
        </div>
      )}
    </div>
  );
});

ReportSchedulesInlineList.displayName = 'ReportSchedulesInlineList';
