import { useMemo } from 'react';
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

  return (
    <div>
      <div>{scheduleDescription}</div>
      {isEnabled && <code className='text-muted-foreground mt-1 block text-xs'>{timeZone}</code>}
    </div>
  );
}
