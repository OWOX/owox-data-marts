import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export class ListProjectScheduledTriggersCommand {
  constructor(
    public readonly projectId: string,
    public readonly limit: number,
    public readonly offset: number,
    public readonly userId: string,
    public readonly roles: string[] = [],
    public readonly type?: ScheduledTriggerType
  ) {}
}
