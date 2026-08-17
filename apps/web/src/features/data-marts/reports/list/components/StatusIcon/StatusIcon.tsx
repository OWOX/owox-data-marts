import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { CircleCheck, XCircle, Loader2, CircleDashed } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { ReportStatusEnum } from '../../../shared/enums/report-status.enum';

interface StatusIconProps {
  status: ReportStatusEnum | null;
  error: string | null;
  className?: string;
}

const statusConfig = {
  [ReportStatusEnum.SUCCESS]: {
    icon: CircleCheck,
    color: 'text-green-500',
    label: 'Success',
  },
  [ReportStatusEnum.ERROR]: {
    icon: XCircle,
    color: 'text-red-500',
    label: 'Fail',
  },
  [ReportStatusEnum.RUNNING]: {
    icon: Loader2,
    color: 'text-primary animate-spin',
    label: 'In progress',
  },
  [ReportStatusEnum.CANCELLED]: {
    icon: XCircle,
    color: 'text-gray-500',
    label: 'Cancelled',
  },
  [ReportStatusEnum.RESTRICTED]: {
    icon: XCircle,
    color: 'text-yellow-500',
    label: 'Restricted',
  },
} as const;

const fallbackStatusConfig = {
  icon: CircleDashed,
  color: 'text-muted-foreground',
  label: 'Unknown',
} as const;

export function StatusIcon({ status, error, className }: StatusIconProps) {
  if (!status) return null;
  const config =
    (statusConfig as Partial<Record<ReportStatusEnum, (typeof statusConfig)[ReportStatusEnum]>>)[
      status
    ] ?? fallbackStatusConfig;
  const { icon: Icon, color, label } = config;

  // Generate unique ID for tooltip
  const tooltipId = `status-tooltip-${status}-${error ? 'error' : 'normal'}`;
  // With an error message to show, the visible tooltip drops the "Fail" heading —
  // the red icon already carries the status. The accessible name keeps it: the
  // ERROR/CANCELLED/RESTRICTED glyphs differ only by color, so without the word a
  // screen reader would hear the message but never that the run failed.
  const errorMessage = status === ReportStatusEnum.ERROR ? error : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon
            className={cn('h-5 w-5', color, className)}
            role='img'
            aria-label={errorMessage ? `${label}: ${errorMessage}` : label}
            aria-describedby={tooltipId}
            tabIndex={0}
          />
        </TooltipTrigger>
        <TooltipContent id={tooltipId} side='bottom' role='tooltip'>
          {errorMessage ? (
            <div className='max-w-xs text-xs break-words whitespace-normal'>{errorMessage}</div>
          ) : (
            <div className='text-xs'>{label}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
