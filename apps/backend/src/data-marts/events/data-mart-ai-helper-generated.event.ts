import { BaseEvent } from '@owox/internal-helpers';
import { DataMartMetadataScope } from '../ai-insights/ai-insights-types';

export interface DataMartAiHelperGeneratedEventPayload {
  projectId: string;
  dataMartId: string;
  userId: string;
  scope: DataMartMetadataScope;
}

/**
 * Emitted once per successful AI metadata generation for a Data Mart.
 * The event `name` varies by scope (e.g. `data-mart.ai-assistant.title.generated`).
 */
export class DataMartAiHelperGeneratedEvent extends BaseEvent<DataMartAiHelperGeneratedEventPayload> {
  constructor(payload: DataMartAiHelperGeneratedEventPayload) {
    super(payload);
  }

  get name(): string {
    return `data-mart.ai-assistant.${this.payload.scope}.generated`;
  }
}
