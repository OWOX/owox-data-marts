import { BaseEvent } from '@owox/internal-helpers';
import {
  PromptAnswer,
  PromptProcessedEntityName,
  PromptTagMeta,
} from '../ai-insights/data-mart-insights.types';
import { ModelUsageByModel, ModelUsageTotals } from '../ai-insights/utils/compute-model-usage';

export interface PromptProcessedEventPayload {
  prompt: string;
  promptAnswer?: string;
  promptStatus: PromptAnswer;
  entityName: PromptProcessedEntityName;
  entityId: string;
  userId: string;
  biProjectId: string;
  meta: Pick<PromptTagMeta, 'reasonDescription' | 'artifact'> & {
    telemetry: string;
    totalUsage: ModelUsageTotals;
    totalUsageByModel: ModelUsageByModel[];
  };
}

export class PromptProcessedEvent extends BaseEvent<PromptProcessedEventPayload> {
  get name() {
    return 'prompt.processed' as const;
  }

  constructor(payload: PromptProcessedEventPayload) {
    super(payload);
  }
}
