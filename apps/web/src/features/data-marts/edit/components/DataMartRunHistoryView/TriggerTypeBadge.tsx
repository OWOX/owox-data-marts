import { Badge } from '@owox/ui/components/badge';
import { DataMartRunTriggerType } from '../../../shared';

interface TriggerTypeBadgeProps {
  triggerType: DataMartRunTriggerType | null;
}

export function TriggerTypeBadge({ triggerType }: TriggerTypeBadgeProps) {
  switch (triggerType) {
    case DataMartRunTriggerType.SCHEDULED:
      return (
        <Badge
          variant='secondary'
          className='bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
        >
          Scheduled
        </Badge>
      );
    case DataMartRunTriggerType.MANUAL:
      return (
        <Badge
          variant='secondary'
          className='bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
        >
          Manual
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
