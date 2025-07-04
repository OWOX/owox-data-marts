import { ScheduledTriggerConfig } from '../../scheduled-trigger-types/scheduled-trigger-config.type';
import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export class ScheduledTriggerDto {
  constructor(
    public readonly id: string,
    public readonly type: ScheduledTriggerType,
    public readonly cronExpression: string,
    public readonly timeZone: string,
    public readonly isActive: boolean,
    public readonly nextRunTimestamp: Date | null,
    public readonly lastRunTimestamp: Date | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly triggerConfig?: ScheduledTriggerConfig
  ) {}
}
