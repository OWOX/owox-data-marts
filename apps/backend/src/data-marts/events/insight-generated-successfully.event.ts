import { BaseEvent } from '@owox/internal-helpers';

export interface InsightGeneratedSuccessfullyEventPayload {
  dataMartId: string;
  insightId: string;
  biProjectId: string;
  userId: string;
}

export class InsightGeneratedSuccessfullyEvent extends BaseEvent<InsightGeneratedSuccessfullyEventPayload> {
  get name() {
    return 'insight.generated.successfully' as const;
  }

  constructor(dataMartId: string, insightId: string, biProjectId: string, userId: string) {
    super({ dataMartId, insightId, biProjectId, userId });
  }
}
