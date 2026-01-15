import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OwoxProducer } from '@owox/internal-helpers';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { PromptProcessedEvent } from '../events/prompt-processed.event';
import { DataMartPromptMetaEntry, PromptProcessedContext } from './data-mart-insights.types';
import { getPromptTotalUsage, getPromptTotalUsageByModels } from './utils/compute-model-usage';

@Injectable()
export class PromptProcessedEventsService {
  private readonly logger = new Logger(PromptProcessedEventsService.name);

  constructor(
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer
  ) {}

  produce(prompts: DataMartPromptMetaEntry[], context?: PromptProcessedContext): void {
    if (!context) return;

    for (const p of prompts) {
      try {
        const llmCalls = p.meta.telemetry.llmCalls ?? [];
        const telemetryJson = JSON.stringify(p.meta.telemetry);

        void this.producer
          .produceEvent(
            new PromptProcessedEvent({
              prompt: p.payload.prompt,
              promptAnswer: p.promptAnswer,
              promptStatus: p.meta.status,
              entityName: context.entityName,
              entityId: context.entityId,
              userId: context.userId,
              biProjectId: context.projectId,
              meta: {
                reasonDescription: p.meta.reasonDescription,
                artifact: p.meta.artifact,
                telemetry: telemetryJson,
                totalUsage: getPromptTotalUsage(llmCalls),
                totalUsageByModel: getPromptTotalUsageByModels(llmCalls),
              },
            })
          )
          .catch(error => {
            this.logger.error('Failed to produce PromptProcessedEvent:', error);
          });
      } catch (error) {
        this.logger.error('Failed to build PromptProcessedEvent:', error);
      }
    }
  }
}
