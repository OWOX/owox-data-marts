import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { CircleCheck, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { GoogleSheetsReportStatusEnum } from '../../../shared/types';

interface StatusIconProps {
  status: GoogleSheetsReportStatusEnum;
  error?: string;
}

const statusConfig = {
  [GoogleSheetsReportStatusEnum.SUCCESS]: {
    icon: CircleCheck,
    color: 'text-green-500',
    label: 'Success',
  },
  [GoogleSheetsReportStatusEnum.FAIL]: {
    icon: XCircle,
    color: 'text-red-500',
    label: 'Fail',
  },
  [GoogleSheetsReportStatusEnum.IN_PROGRESS]: {
    icon: Loader2,
    color: 'text-brand-blue-500 animate-spin',
    label: 'In progress',
  },
} as const;

export function StatusIcon({ status, error }: StatusIconProps) {
  const config = statusConfig[status];
  const { icon: Icon, color, label } = config;

  // Generate unique ID for tooltip
  const tooltipId = `status-tooltip-${status}-${error ? 'error' : 'normal'}`;

  // Create accessible description
  const getAccessibleDescription = () => {
    if (status === GoogleSheetsReportStatusEnum.FAIL && error) {
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
          <span>{label}</span>
          {status === GoogleSheetsReportStatusEnum.FAIL && error && (
            <div className='mt-1 text-xs text-red-500'>{error}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
