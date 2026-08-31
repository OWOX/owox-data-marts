import { useMemo } from 'react';
import { timezoneService } from '../../../../../services/timezone.service';
import { parseScheduleFromCron } from '../../utils/schedule-utils';

interface ScheduleDisplayProps {
  cronExpression: string;
  timeZone: string;
  isEnabled?: boolean;
}

export function ScheduleDisplay({
  cronExpression,
  timeZone,
  isEnabled = true,
}: ScheduleDisplayProps) {
  const scheduleDescription = useMemo(() => {
    return parseScheduleFromCron(cronExpression, timeZone, isEnabled);
  }, [cronExpression, timeZone, isEnabled]);
  const timeZoneDisplayName = timezoneService.getTimezoneDisplayName(timeZone);

  return (
    <div>
      <div>{scheduleDescription}</div>
      {isEnabled && (
        <code className='text-muted-foreground mt-1 block text-xs'>{timeZoneDisplayName}</code>
      )}
    </div>
  );
}
