import { ScheduledTriggerConfig } from '../../scheduled-trigger-types/scheduled-trigger-config.type';
import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export class CreateScheduledTriggerCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly dataMartId: string,
    public readonly type: ScheduledTriggerType,
    public readonly cronExpression: string,
    public readonly timeZone: string,
    public readonly isActive: boolean = true,
    public readonly triggerConfig?: ScheduledTriggerConfig
  ) {}
}
