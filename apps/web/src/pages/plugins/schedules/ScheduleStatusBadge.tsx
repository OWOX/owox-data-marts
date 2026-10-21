import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  SCHEDULE_DISABLED_REASON_TEXT,
  type ProjectPluginSchedule,
} from '../../../features/plugins';
import { StatusLabel, StatusTypeEnum } from '../../../shared/components/StatusLabel';
import { SCHEDULE_STATUS_LABEL, scheduleStatus, type ScheduleStatus } from './scheduleStatus';

// Coloured text without a frame, like the Data Mart trigger status.
const TYPE: Record<ScheduleStatus, StatusTypeEnum> = {
  active: StatusTypeEnum.SUCCESS,
  paused: StatusTypeEnum.NEUTRAL,
  disabled: StatusTypeEnum.ERROR,
  removed: StatusTypeEnum.NEUTRAL,
};

export function ScheduleStatusBadge({ schedule }: { schedule: ProjectPluginSchedule }) {
  const status = scheduleStatus(schedule);
  const badge = (
    <StatusLabel type={TYPE[status]} showIcon={false}>
      {SCHEDULE_STATUS_LABEL[status]}
    </StatusLabel>
  );
  if (status !== 'disabled' || schedule.disabledReason === null) {
    return badge;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{badge}</span>
      </TooltipTrigger>
      <TooltipContent>{SCHEDULE_DISABLED_REASON_TEXT[schedule.disabledReason]}</TooltipContent>
    </Tooltip>
  );
}
