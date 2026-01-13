import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { CircleCheck, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { ReportStatusEnum } from '../../../shared/enums/report-status.enum';

interface StatusIconProps {
  status: ReportStatusEnum | null;
  error: string | null;
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

export function StatusIcon({ status, error }: StatusIconProps) {
  if (!status) return null;
  const config = statusConfig[status];
  const { icon: Icon, color, label } = config;

  // Generate unique ID for tooltip
  const tooltipId = `status-tooltip-${status}-${error ? 'error' : 'normal'}`;
  const getAccessibleDescription = () => {
    if (status === ReportStatusEnum.ERROR && error) {
      return `${label}: ${error}`;
    }
    return label;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon
            className={cn('h-5 w-5', color)}
            role='img'
            aria-label={getAccessibleDescription()}
            aria-describedby={tooltipId}
            tabIndex={0}
          />
        </TooltipTrigger>
        <TooltipContent id={tooltipId} side='bottom' role='tooltip'>
          <div className='text-xs'>{label}</div>
          {status === ReportStatusEnum.ERROR && error && (
            <div className='mt-1 max-w-xs text-xs break-words whitespace-normal'>{error}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
