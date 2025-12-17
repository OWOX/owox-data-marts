import { Inject, Injectable, Logger } from '@nestjs/common';
import { type OwoxProducer } from '@owox/internal-helpers';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { TemplateRenderFacade } from '../../common/template/facades/template-render.facade';
import {
  TEMPLATE_RENDER_FACADE,
  TemplateRenderInput,
} from '../../common/template/types/render-template.types';
import { PromptProcessedEvent } from '../events/prompt-processed.event';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import {
  DataMartAdditionalParams,
  DataMartInsightTemplateFacade,
  DataMartInsightTemplateInput,
  DataMartInsightTemplateOutput,
  DataMartInsightTemplateStatus,
  DataMartPromptMetaEntry,
  isPromptAnswerError,
  isPromptAnswerWarning,
  PromptTagMetaEntry,
} from './data-mart-insights.types';
import { PromptTagHandler } from './template/handlers/prompt-tag.handler';
import { getPromptTotalUsage, getPromptTotalUsageByModels } from './utils/compute-model-usage';

@Injectable()
export class DataMartInsightTemplateFacadeImpl implements DataMartInsightTemplateFacade {
  private readonly logger = new Logger(DataMartInsightTemplateFacadeImpl.name);

  constructor(
    @Inject(TEMPLATE_RENDER_FACADE)
    private readonly templateRenderer: TemplateRenderFacade<
      PromptTagMetaEntry,
      DataMartAdditionalParams
    >,
    private readonly promptHandler: PromptTagHandler,
    private readonly consumptionTracker: ConsumptionTrackingService,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer
  ) {}

  async render(input: DataMartInsightTemplateInput): Promise<DataMartInsightTemplateOutput> {
    const baseInput: TemplateRenderInput<DataMartAdditionalParams> = {
      template: input.template,
      context: input.context,
      additionalParams: { ...input.params, wholeTemplate: input.template },
    };

    const { rendered, meta } = await this.templateRenderer.render(baseInput, [this.promptHandler]);

    const tags = meta?.tags ?? [];

    const prompts: DataMartPromptMetaEntry[] = tags.map(tag => ({
      payload: tag.payload,
      meta: tag.resultMeta,
      promptAnswer: tag.result as string,
    }));

    const consumptionContext = input.consumptionContext;
    if (consumptionContext) {
      prompts
        .filter(p => !isPromptAnswerError(p.meta.status))
        .forEach(p => {
          try {
            const llmCalls = p.meta.telemetry?.llmCalls ?? [];
            void this.consumptionTracker.registerAiProcessRunConsumption(
              getPromptTotalUsage(llmCalls).totalTokens,
              consumptionContext
            );
          } catch (error) {
            this.logger.error('Failed to register consumption:', error);
          }
        });
    }

    this.producePromptProcessedEvents(prompts, input.promptProcessedContext);

    return {
      rendered: rendered,
      status: this.computeStatus(prompts),
      prompts,
    };
  }

  private producePromptProcessedEvents(
    prompts: DataMartPromptMetaEntry[],
    promptProcessedContext?: DataMartInsightTemplateInput['promptProcessedContext']
  ): void {
    if (!promptProcessedContext) return;

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
              entityName: promptProcessedContext.entityName,
              entityId: promptProcessedContext.entityId,
              userId: promptProcessedContext.userId,
              biProjectId: promptProcessedContext.projectId,
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

  private computeStatus(prompts: DataMartPromptMetaEntry[]) {
    const hasAtLeastOneWithError = prompts.some(p => isPromptAnswerError(p.meta.status));
    const hasAtLeastOneWithWarning = prompts.some(p => isPromptAnswerWarning(p.meta.status));

    return hasAtLeastOneWithError
      ? DataMartInsightTemplateStatus.ERROR
      : hasAtLeastOneWithWarning
        ? DataMartInsightTemplateStatus.WARNING
        : DataMartInsightTemplateStatus.OK;
  }
}
