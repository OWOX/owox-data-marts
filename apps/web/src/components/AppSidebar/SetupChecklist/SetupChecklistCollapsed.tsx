import { useSidebar } from '@owox/ui/components/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { CircularProgress } from './CircularProgress';

interface SetupChecklistCollapsedProps {
  percentage: number;
  completedCount: number;
  totalCount: number;
}

export function SetupChecklistCollapsed({
  percentage,
  completedCount,
  totalCount,
}: SetupChecklistCollapsedProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type='button'
          onClick={toggleSidebar}
          className='hover:bg-sidebar-accent mx-auto flex size-8 items-center justify-center rounded-md transition-colors'
          aria-label={`Setup progress: ${String(completedCount)} of ${String(totalCount)} steps completed`}
        >
          <CircularProgress percentage={percentage} size={20} />
        </button>
      </TooltipTrigger>
      <TooltipContent side='right'>Get to know OWOX — {percentage}% completed</TooltipContent>
    </Tooltip>
  );
}
