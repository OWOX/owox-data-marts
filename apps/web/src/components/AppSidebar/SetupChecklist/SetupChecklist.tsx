import { X } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { SetupGroupPopover } from './SetupGroupPopover';
import type { SetupProgressResult } from './useSetupProgress';
import type { SetupChecklistVisibility } from './useSetupChecklistVisibility';
import { SetupChecklistCompleted } from './SetupChecklistCompleted';
import { useCallback } from 'react';

interface SetupChecklistProps {
  progressResult: SetupProgressResult;
  visibility: SetupChecklistVisibility;
}

export function SetupChecklist({ progressResult, visibility }: SetupChecklistProps) {
  const { percentage, progress, groupProgresses } = progressResult;
  const { hide } = visibility;

  const handleDismiss = useCallback(() => {
    hide();
  }, [hide]);

  const isEmpty = percentage <= 0;
  const isCompleted = percentage >= 100;
  const progressWidth = Math.min(100, percentage);

  return (
    <div className='relative z-0 mb-0.5 flex flex-col gap-1 rounded-md border shadow-sm'>
      {/* Header */}
      <div
        className={cn('bg-background flex flex-col gap-1 rounded-t-md', isCompleted && 'border-b')}
      >
        {/* Title */}
        <div className='flex items-start justify-between gap-2'>
          <div className='flex flex-col gap-0.5 py-2 pl-4'>
            <span className='text-sidebar-foreground text-sm font-semibold'>Get to know OWOX</span>
            <span className='text-muted-foreground text-xs'>
              {isEmpty ? (
                'Easy steps to set up and run'
              ) : (
                <>
                  <span className='tabular-nums'>{percentage}%</span> completed
                </>
              )}
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
        {!isCompleted && (
          <div className='flex items-center gap-2'>
            <div className='bg-sidebar-border h-1 flex-1 overflow-hidden'>
              <div
                className='bg-primary h-full transition-all duration-300'
                style={{ width: `${String(progressWidth)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {isCompleted ? (
        <SetupChecklistCompleted />
      ) : (
        <div className='flex flex-col px-2 pt-2 pb-4'>
          {groupProgresses.map(groupProgress => (
            <SetupGroupPopover
              key={groupProgress.group.id}
              groupProgress={groupProgress}
              progress={progress}
            />
          ))}
        </div>
      )}

      {/* Pointer */}
      <div className='bg-sidebar pointer-events-none absolute -bottom-2 left-4 z-0 h-4 w-4 rotate-45 border-r border-b' />
    </div>
  );
}
