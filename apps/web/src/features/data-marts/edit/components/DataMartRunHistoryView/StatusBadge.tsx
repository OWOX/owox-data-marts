import { Badge } from '@owox/ui/components/badge';
import { RunStatus } from './types';

interface StatusBadgeProps {
  status: RunStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case RunStatus.RUNNING:
      return (
        <Badge variant='secondary' className='text-primary bg-primary/10'>
          Running
        </Badge>
      );
    case RunStatus.SUCCESS:
      return (
        <Badge
          variant='secondary'
          className='bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400'
        >
          Success
        </Badge>
      );
    case RunStatus.FAILED:
      return (
        <Badge
          variant='secondary'
          className='bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400'
        >
          Failed
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
