import { ArrowRight, CircleCheckBig, CircleArrowRight } from 'lucide-react';
import type { GroupProgress } from './types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { GroupStatusType } from './types';

interface SetupChecklistGroupProps {
  groupProgress: GroupProgress;
  onClick: () => void;
}

export function SetupChecklistGroup({ groupProgress, onClick }: SetupChecklistGroupProps) {
  const { group, status } = groupProgress;

  const statusConfig = {
    [GroupStatusType.DONE]: {
      icon: <CircleCheckBig className='text-muted-foreground/50 size-4 shrink-0' />,
      label: 'Done',
    },
    [GroupStatusType.IN_PROGRESS]: {
      icon: <CircleArrowRight className='text-muted-foreground size-4 shrink-0' />,
      label: 'In progress',
    },
    [GroupStatusType.NOT_STARTED]: {
      icon: <ArrowRight className='text-muted-foreground size-4 shrink-0' />,
      label: 'Not started',
    },
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          onClick={onClick}
          className={`hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
            status === GroupStatusType.DONE ? 'text-muted-foreground/50' : ''
          }`}
        >
          {statusConfig[status].icon}
          <span
            className={`transition-all duration-300 ${
              status === GroupStatusType.DONE ? 'line-through' : 'text-sidebar-foreground'
            }`}
          >
            {group.title}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{statusConfig[status].label}</TooltipContent>
    </Tooltip>
  );
}
