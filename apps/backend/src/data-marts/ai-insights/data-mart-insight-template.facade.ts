import { Inject, Injectable } from '@nestjs/common';
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
  isPromptAnswerOk,
  isPromptAnswerWarning,
  PromptTagMetaEntry,
} from './data-mart-insights.types';
import { PromptTagHandler } from './template/handlers/prompt-tag.handler';
import { getPromptTotalUsage } from './utils/compute-model-usage';

@Injectable()
export class DataMartInsightTemplateFacadeImpl implements DataMartInsightTemplateFacade {
  constructor(
    @Inject(TEMPLATE_RENDER_FACADE)
    private readonly templateRenderer: TemplateRenderFacade<
      PromptTagMetaEntry,
      DataMartAdditionalParams
    >,
    private readonly promptHandler: PromptTagHandler,
    private readonly consumptionTracker: ConsumptionTrackingService
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
        .filter(p => isPromptAnswerOk(p.meta.status))
        .forEach(p =>
          this.consumptionTracker.registerAiProcessRunConsumption(
            getPromptTotalUsage(p.meta.telemetry.llmCalls).totalTokens,
            consumptionContext
          )
        );
    }

    return {
      rendered: rendered,
      status: this.computeStatus(prompts),
      prompts,
    };
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
