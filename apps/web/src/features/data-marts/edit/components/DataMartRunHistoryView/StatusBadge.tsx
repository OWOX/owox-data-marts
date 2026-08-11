import { Badge } from '@owox/ui/components/badge';
import { cn } from '@owox/ui/lib/utils';
import { DataMartRunStatus } from '../../../shared';
import type { DataQualityCompactSummary } from '../../../shared/types';
import {
  DATA_QUALITY_STATUS_TEXT_CLASSES,
  getDataQualityStatusVisual,
} from '../../../shared/utils/data-quality-status';

interface StatusBadgeProps {
  status: DataMartRunStatus;
  qualitySummary?: DataQualityCompactSummary | null;
}

export function StatusBadge({ status, qualitySummary }: StatusBadgeProps) {
  if (qualitySummary) {
    const visual = getDataQualityStatusVisual(qualitySummary);
    return (
      <Badge
        variant='secondary'
        className={cn('bg-muted/60', DATA_QUALITY_STATUS_TEXT_CLASSES[visual.tone])}
      >
        {visual.label}
      </Badge>
    );
  }

  switch (status) {
    case DataMartRunStatus.RUNNING:
      return (
        <Badge
          variant='secondary'
          className='text-primary bg-primary/10 inline-flex items-center gap-1.5'
        >
          <span className='relative flex h-1.5 w-1.5'>
            <span className='bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75'></span>
            <span className='bg-primary relative inline-flex h-1.5 w-1.5 rounded-full'></span>
          </span>
          Running
        </Badge>
      );
    case DataMartRunStatus.SUCCESS:
      return (
        <Badge
          variant='secondary'
          className='bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400'
        >
          Success
        </Badge>
      );
    case DataMartRunStatus.FAILED:
      return (
        <Badge
          variant='secondary'
          className='bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400'
        >
          Failed
        </Badge>
      );
    case DataMartRunStatus.CANCELLED:
      return (
        <Badge
          variant='secondary'
          className='bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400'
        >
          Cancelled
        </Badge>
      );
    case DataMartRunStatus.INTERRUPTED:
      return (
        <Badge
          variant='secondary'
          className='bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400'
        >
          Interrupted
        </Badge>
      );
    case DataMartRunStatus.PENDING:
      return (
        <Badge
          variant='secondary'
          className='bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400'
        >
          Pending
        </Badge>
      );
    case DataMartRunStatus.RESTRICTED:
      return (
        <Badge
          variant='secondary'
          className='bg-yellow-50 text-yellow-500 dark:bg-yellow-950 dark:text-yellow-400'
        >
          Restricted
        </Badge>
      );
    default:
      return (
        <Badge
          variant='secondary'
          className='bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400'
        >
          Unknown
        </Badge>
      );
  }
}
