import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export class UpdateScheduledTriggerCommand {
  constructor(
    public readonly id: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly cronExpression: string,
    public readonly timeZone?: string,
    public readonly isActive?: boolean,
    public readonly expectedType?: ScheduledTriggerType
  ) {}
}
