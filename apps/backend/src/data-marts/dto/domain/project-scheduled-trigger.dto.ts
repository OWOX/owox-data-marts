import { ScheduledTriggerDto } from './scheduled-trigger.dto';

export interface ProjectScheduledTriggerDataMartRefDto {
  readonly id: string;
  readonly title: string;
}

export class ProjectScheduledTriggerDto {
  constructor(
    public readonly trigger: ScheduledTriggerDto,
    public readonly dataMart: ProjectScheduledTriggerDataMartRefDto,
    public readonly canEdit: boolean,
    public readonly canDelete: boolean
  ) {}
}
