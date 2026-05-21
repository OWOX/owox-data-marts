import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Accordion } from '@owox/ui/components/accordion';
import { SetupChecklistGroup } from './SetupChecklistGroup';
import { SetupStepAccordion } from './SetupStepAccordion';
import { SETUP_STEPS } from './items';
import type { GroupProgress, ProjectSetupProgress } from './types';
import { formatDateShort } from '../../../utils/date-formatters';
import { GroupStatusType } from './types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';

interface SetupGroupPopoverProps {
  groupProgress: GroupProgress;
  progress: ProjectSetupProgress;
}

export function SetupGroupPopover({ groupProgress, progress }: SetupGroupPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { group, status, completedCount, totalCount, completedAt } = groupProgress;
  const groupSteps = useMemo(() => {
    const stepIdsSet = new Set(group.stepIds);
    return SETUP_STEPS.filter(step => stepIdsSet.has(step.id));
  }, [group.stepIds]);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div>
          <SetupChecklistGroup
            groupProgress={groupProgress}
            onClick={() => {
              setIsOpen(true);
            }}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent side='right' align='start' className='w-96'>
        <div className='flex flex-col gap-4'>
          {/* Header */}
          <div className='flex flex-col gap-0.5'>
            <div className='flex items-center justify-between gap-2'>
              <h3 className='text-base font-semibold'>{group.title}</h3>
              {group.description && status !== GroupStatusType.DONE && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className='text-muted-foreground/75 hover:text-muted-foreground size-4 shrink-0' />
                  </TooltipTrigger>
                  <TooltipContent>{group.description}</TooltipContent>
                </Tooltip>
              )}
            </div>
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
