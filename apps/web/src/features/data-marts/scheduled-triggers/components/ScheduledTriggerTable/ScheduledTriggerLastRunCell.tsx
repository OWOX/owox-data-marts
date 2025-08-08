import RelativeTime from '@owox/ui/components/common/relative-time';
import { useConnectorRunData } from '../../hooks/useConnectorRunData';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';
import { ScheduledTriggerType } from '../../enums';

interface ScheduledTriggerLastRunCellProps {
  trigger: ScheduledTrigger;
}

export function ScheduledTriggerLastRunCell({ trigger }: ScheduledTriggerLastRunCellProps) {
  const connectorRunData = useConnectorRunData(trigger);

  if (trigger.type === ScheduledTriggerType.CONNECTOR_RUN) {
    // For connector runs, use the actual data mart run data
    return (
      <div className='text-muted-foreground text-sm'>
        {connectorRunData.lastRunDate ? (
          <RelativeTime date={connectorRunData.lastRunDate} />
        ) : (
          'Never run'
        )}
      </div>
    );
  }

  // For report runs, use the trigger's lastRun timestamp
  const lastRunTimestamp = trigger.lastRun;
  return (
    <div className='text-muted-foreground text-sm'>
      {lastRunTimestamp ? <RelativeTime date={new Date(lastRunTimestamp)} /> : 'Never run'}
    </div>
  );
}
