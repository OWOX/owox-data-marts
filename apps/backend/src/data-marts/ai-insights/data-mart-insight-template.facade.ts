import { Inject, Injectable } from '@nestjs/common';
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
import {
  TEMPLATE_RENDER_FACADE,
  TemplateRenderInput,
} from '../../common/template/types/render-template.types';
import { PromptTagHandler } from './template/handlers/prompt-tag.handler';
import { TemplateRenderFacade } from '../../common/template/facades/template-render.facade';

@Injectable()
export class DataMartInsightTemplateFacadeImpl implements DataMartInsightTemplateFacade {
  constructor(
    @Inject(TEMPLATE_RENDER_FACADE)
    private readonly templateRenderer: TemplateRenderFacade<
      PromptTagMetaEntry,
      DataMartAdditionalParams
    >,
    private readonly promptHandler: PromptTagHandler
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
