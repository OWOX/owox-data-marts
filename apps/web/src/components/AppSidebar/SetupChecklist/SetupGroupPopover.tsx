'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Accordion } from '@owox/ui/components/accordion';
import { SetupChecklistGroup } from './SetupChecklistGroup';
import { SetupStepAccordion } from './SetupStepAccordion';
import { SETUP_STEPS } from './items';
import type { GroupProgress, ProjectSetupProgress } from './types';
import { formatDateShort } from '../../../utils/date-formatters';
import { GroupStatusType } from './types';

interface SetupGroupPopoverProps {
  groupProgress: GroupProgress;
  progress: ProjectSetupProgress;
}

export function SetupGroupPopover({ groupProgress, progress }: SetupGroupPopoverProps) {
  const [open, setOpen] = useState(false);
  const { group, status, completedCount, totalCount, completedAt } = groupProgress;
  const groupSteps = SETUP_STEPS.filter(step => group.stepIds.includes(step.id));

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <SetupChecklistGroup
            groupProgress={groupProgress}
            onClick={() => {
              setOpen(true);
            }}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent side='right' align='start' className='w-96'>
        <div className='flex flex-col gap-4'>
          {/* Header */}
          <div className='flex flex-col gap-0.5'>
            <h3 className='text-base font-semibold'>{group.title}</h3>
            {status === GroupStatusType.DONE && completedAt ? (
              <p className='text-muted-foreground text-xs'>
                Completed on {formatDateShort(completedAt)}
              </p>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {completedCount} of {totalCount} completed
              </p>
            )}
          </div>

          {/* Steps Accordion */}
          <Accordion
            type='single'
            className='border-border w-full overflow-hidden rounded-md border'
          >
            {groupSteps.map(step => (
              <SetupStepAccordion
                key={step.id}
                step={step}
                stepProgress={progress[step.progressKey]}
                onClose={handleClose}
              />
            ))}
          </Accordion>
        </div>
      </PopoverContent>
    </Popover>
  );
}
