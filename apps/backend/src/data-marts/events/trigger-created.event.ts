import { BaseEvent } from '@owox/internal-helpers';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export interface TriggerCreatedEventPayload {
  triggerId: string;
  dataMartId: string;
  projectId: string;
  type: ScheduledTriggerType;
  createdById: string;
}

export class TriggerCreatedEvent extends BaseEvent<TriggerCreatedEventPayload> {
  get name() {
    return 'trigger.created' as const;
  }

  constructor(
    triggerId: string,
    dataMartId: string,
    projectId: string,
    type: ScheduledTriggerType,
    createdById: string
  ) {
    super({ triggerId, dataMartId, projectId, type, createdById });
  }
}
