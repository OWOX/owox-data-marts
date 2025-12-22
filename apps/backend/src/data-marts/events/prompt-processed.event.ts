import { BaseEvent } from '@owox/internal-helpers';
import {
  PromptAnswer,
  PromptProcessedEntityName,
  PromptTagMeta,
} from '../ai-insights/data-mart-insights.types';
import { ModelUsageByModel, ModelUsageTotals } from '../ai-insights/utils/compute-model-usage';

export type PromptMetaBase = Pick<PromptTagMeta, 'reasonDescription' | 'artifact'>;

export interface PromptExecutionMeta extends PromptMetaBase {
  telemetry: string;
  totalUsage: ModelUsageTotals;
  totalUsageByModel: ModelUsageByModel[];
}

export interface PromptProcessedEventPayload {
  prompt: string;
  promptAnswer?: string;
  promptStatus: PromptAnswer;
  entityName: PromptProcessedEntityName;
  entityId: string;
  userId: string;
  biProjectId: string;
  meta: PromptExecutionMeta;
}

export class PromptProcessedEvent extends BaseEvent<PromptProcessedEventPayload> {
  get name() {
    return 'prompt.processed' as const;
  }

  constructor(payload: PromptProcessedEventPayload) {
    super(payload);
  }
}
