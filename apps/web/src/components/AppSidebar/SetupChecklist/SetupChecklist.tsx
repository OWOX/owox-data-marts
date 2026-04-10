import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { trackEvent } from '../../../utils/data-layer';
import { SetupGroupPopover } from './SetupGroupPopover';
import type { SetupProgressResult } from './useSetupProgress';
import type { SetupChecklistVisibility } from './useSetupChecklistVisibility';

interface SetupChecklistProps {
  progressResult: SetupProgressResult;
  visibility: SetupChecklistVisibility;
}

export function SetupChecklist({ progressResult, visibility }: SetupChecklistProps) {
  const { completedStepIds, completedCount, totalCount, percentage, progress, groupProgresses } =
    progressResult;
  const { hide } = visibility;
  const viewedTrackedRef = useRef(false);

  // Fire "viewed" event once per mount
  useEffect(() => {
    if (viewedTrackedRef.current) return;
    viewedTrackedRef.current = true;

    trackEvent({
      event: 'setup_checklist_viewed',
      category: 'SetupChecklist',
      action: 'View',
      value: String(percentage),
      details: JSON.stringify({
        completedSteps: completedStepIds,
        completedCount,
        totalCount,
        groups: groupProgresses.map(g => ({
          id: g.group.id,
          status: g.status,
          completedCount: g.completedCount,
          totalCount: g.totalCount,
        })),
      }),
    });
  }, [completedStepIds, completedCount, totalCount, percentage, groupProgresses]);

  const handleDismiss = () => {
    trackEvent({
      event: 'setup_checklist_dismissed',
      category: 'SetupChecklist',
      action: 'Dismiss',
      value: String(percentage),
      details: JSON.stringify({
        completedSteps: completedStepIds,
        completedCount,
        totalCount,
        groups: groupProgresses.map(g => ({
          id: g.group.id,
          status: g.status,
          completedCount: g.completedCount,
          totalCount: g.totalCount,
        })),
      }),
    });
    hide();
  };

  return (
    <div className='relative z-0 mb-0.5 flex flex-col gap-1 rounded-md border shadow-sm'>
      {/* Header */}
      <div className='bg-background flex flex-col gap-1 rounded-t-md'>
        {/* Title */}
        <div className='flex items-start justify-between gap-2'>
          <div className='flex flex-col gap-0.5 py-2 pl-4'>
            <span className='text-sidebar-foreground text-sm font-semibold'>Get to know OWOX</span>
            <span className='text-muted-foreground text-xs'>
              <span className='tabular-nums'>{percentage}%</span> completed
            </span>
          </div>
          <button
            type='button'
            onClick={handleDismiss}
            className='text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/75 mt-1 mr-1 rounded p-1 transition-colors'
            aria-label='Dismiss setup checklist'
          >
            <X className='size-4' />
          </button>
        </div>

        {/* Progress bar */}
        <div className='flex items-center gap-2'>
          <div className='bg-sidebar-border h-1 flex-1 overflow-hidden'>
            <div
              className='bg-primary h-full transition-all duration-300'
              style={{ width: `${String(Math.min(100, percentage))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Groups */}
      <div className='flex flex-col p-2'>
        {groupProgresses.map(groupProgress => (
          <SetupGroupPopover
            key={groupProgress.group.id}
            groupProgress={groupProgress}
            progress={progress}
          />
        ))}
      </div>

      {/* Pointer */}
      <div className='bg-background pointer-events-none absolute -bottom-2 left-4 z-0 h-4 w-4 rotate-45 border-r border-b' />
    </div>
  );
}
