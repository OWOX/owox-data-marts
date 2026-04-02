import { BaseEvent } from '@owox/internal-helpers';

export interface InsightTemplateRunRequestedEventPayload {
  projectId: string;
  dataMartId: string;
  userId: string;
  insightTemplateId: string;
  triggerId: string;
  type: 'manual' | 'chat';
  assistantMessageId?: string;
}

export class InsightTemplateRunRequestedEvent extends BaseEvent<InsightTemplateRunRequestedEventPayload> {
  get name() {
    return 'insight_template.run_requested' as const;
  }

  constructor(payload: InsightTemplateRunRequestedEventPayload) {
    super(payload);
  }
}
