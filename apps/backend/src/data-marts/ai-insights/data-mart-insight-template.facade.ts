import { Inject, Injectable, Logger } from '@nestjs/common';
import { TemplateRenderFacade } from '../../common/template/facades/template-render.facade';
import {
  TEMPLATE_RENDER_FACADE,
  TemplateRenderInput,
} from '../../common/template/types/render-template.types';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';
import {
  DataMartAdditionalParams,
  DataMartInsightTemplateFacade,
  DataMartInsightTemplateInput,
  DataMartInsightTemplateOutput,
  DataMartInsightTemplateStatus,
  DataMartPromptMetaEntry,
  isPromptAnswerError,
  isPromptAnswerRestricted,
  isPromptAnswerWarning,
  PromptTagMetaEntry,
} from './data-mart-insights.types';
import { PromptProcessedEventsService } from './prompt-processed-events.service';
import { PromptTagHandler } from './template/handlers/prompt-tag.handler';
import { getPromptTotalUsage } from './utils/compute-model-usage';

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
    private readonly promptProcessedEvents: PromptProcessedEventsService
  ) {}

  async render(input: DataMartInsightTemplateInput): Promise<DataMartInsightTemplateOutput> {
    const baseInput: TemplateRenderInput<DataMartAdditionalParams> = {
      template: input.template,
      context: input.context,
      additionalParams: { ...input.params, wholeTemplate: input.template },
    };

    const { rendered, meta } = await this.templateRenderer.render(
      baseInput,
      [this.promptHandler],
      input.disableBaseTagHandlers
    );

    const tags = meta?.tags ?? [];

    const prompts: DataMartPromptMetaEntry[] = tags
      .filter(t => t.tag === this.promptHandler.tag)
      .map(tag => ({
        payload: tag.payload,
        meta: tag.resultMeta,
        promptAnswer: tag.result as string,
      }));

    const consumptionContext = input.consumptionContext;
    if (consumptionContext) {
      prompts
        .filter(
          p => !isPromptAnswerError(p.meta.status) && !isPromptAnswerRestricted(p.meta.status)
        )
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

    this.promptProcessedEvents.produce(prompts, input.promptProcessedContext);

    return {
      rendered: rendered,
      status: this.computeStatus(prompts),
      prompts,
    };
  }

  private computeStatus(prompts: DataMartPromptMetaEntry[]) {
    const hasAtLeastOneWithError = prompts.some(p => isPromptAnswerError(p.meta.status));
    const hasAtLeastOneWithRestricted = prompts.some(p => isPromptAnswerRestricted(p.meta.status));
    const hasAtLeastOneWithWarning = prompts.some(p => isPromptAnswerWarning(p.meta.status));

    return hasAtLeastOneWithError || hasAtLeastOneWithRestricted
      ? DataMartInsightTemplateStatus.ERROR
      : hasAtLeastOneWithWarning
        ? DataMartInsightTemplateStatus.WARNING
        : DataMartInsightTemplateStatus.OK;
  }
}
