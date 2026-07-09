import type { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';

export const reportTitleCellQuickActionClassName =
  'pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100';

interface ReportTitleCellProps {
  title: string;
  actions?: ReactNode;
}

export function ReportTitleCell({ title, actions }: ReportTitleCellProps) {
  return (
    <div className='flex items-center gap-2'>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className='min-w-0 truncate'>{title}</span>
          </TooltipTrigger>

          <TooltipContent side='bottom'>{title}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {actions && (
        <div
          className='flex flex-shrink-0 items-center'
          onClick={e => {
            e.stopPropagation();
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
