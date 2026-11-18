import { ArrowRight, CircleCheckBig, CircleArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import type { GroupProgress } from './types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { GroupStatusType } from './types';

type SetupChecklistGroupProps =
  | { groupProgress: GroupProgress; onClick: () => void; to?: never }
  | { groupProgress: GroupProgress; to: string; onClick?: never };

interface GroupStatusConfig {
  icon: React.ReactNode;
  label: string;
}

const GROUP_STATUS_CONFIG: Record<GroupStatusType, GroupStatusConfig> = {
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

export function SetupChecklistGroup({ groupProgress, onClick, to }: SetupChecklistGroupProps) {
  const { group, status } = groupProgress;
  const isDone = status === GroupStatusType.DONE;
  const { icon, label } = GROUP_STATUS_CONFIG[status];

  const className = `hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
    isDone ? 'text-muted-foreground/50' : ''
  }`;
  const content = (
    <>
      {icon}
      <span
        className={`transition-all duration-300 ${
          isDone ? 'line-through' : 'text-sidebar-foreground'
        }`}
      >
        {group.title}
      </span>
    </>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {to !== undefined ? (
          <Link to={to} className={className}>
            {content}
          </Link>
        ) : (
          <button
            type='button'
            onClick={e => {
              e.stopPropagation();
              onClick();
            }}
            className={className}
          >
            {content}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
