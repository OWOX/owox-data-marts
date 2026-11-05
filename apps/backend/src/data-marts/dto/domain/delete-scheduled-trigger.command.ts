import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export class DeleteScheduledTriggerCommand {
  constructor(
    public readonly id: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly expectedType?: ScheduledTriggerType
  ) {}
}
