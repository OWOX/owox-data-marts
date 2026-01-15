import { Inject, Injectable } from '@nestjs/common';
import { trimString } from '@owox/internal-helpers';
import { HelperOptions } from 'handlebars';
import { AgentTelemetry } from '../../../../common/ai-insights/agent/types';
import { ProjectOperationBlockedException } from '../../../../common/exceptions/project-operation-blocked.exception';
import {
  wrapCautionBlock,
  wrapCodeBlock,
  wrapWarningBlock,
} from '../../../../common/markdown/helpers/blockquote-alert-wrapper';
import { TagHandler } from '../../../../common/template/handlers/tag-handler.interface';
import {
  ADDITIONAL_PARAMS_SYMBOL,
  RootWithAdditional,
  TagRenderedResult,
} from '../../../../common/template/types/render-template.types';
import { ProjectBalanceService } from '../../../services/project-balance.service';
import { AI_INSIGHTS_FACADE, AnswerPromptResponse } from '../../ai-insights-types';
import {
  DataMartAdditionalParams,
  isPromptAnswerError,
  isPromptAnswerOk,
  PromptAnswer,
  PromptTagMeta,
  PromptTagPayload,
} from '../../data-mart-insights.types';
import { AiInsightsFacade } from '../../facades/ai-insights.facade';

@Injectable()
export class PromptTagHandler implements TagHandler<
  PromptTagPayload,
  TagRenderedResult<PromptTagMeta>
> {
  readonly tag = 'prompt' as const;

  constructor(
    @Inject(AI_INSIGHTS_FACADE)
    private readonly aiInsightFacade: AiInsightsFacade,
    private readonly projectBalanceService: ProjectBalanceService
  ) {}

  buildPayload(args: unknown[], options: HelperOptions, context: unknown): PromptTagPayload {
    const [maybeInline] = args;

    const blockText = options.fn ? String(options.fn(context)).trim() : undefined;
    const inlineText =
      typeof maybeInline === 'string' && maybeInline.trim().length > 0 ? maybeInline : undefined;

    const prompt = inlineText ?? blockText ?? '';

    const root = options.data?.root as RootWithAdditional<DataMartAdditionalParams>;
    const extra = root[ADDITIONAL_PARAMS_SYMBOL];

    if (!extra) {
      throw new Error('Data-mart additional params are missing');
    }

    return {
      prompt,
      projectId: extra.projectId,
      dataMartId: extra.dataMartId,
      wholeTemplate: extra.wholeTemplate,
      options: extra.options,
    };
  }

  async handle(input: PromptTagPayload): Promise<TagRenderedResult<PromptTagMeta>> {
    try {
      await this.projectBalanceService.verifyCanPerformOperations(input.projectId);
    } catch (error) {
      if (error instanceof ProjectOperationBlockedException) {
        return {
          rendered: wrapCautionBlock(error.message),
          meta: {
            prompt: input.prompt,
            status: PromptAnswer.RESTRICTED,
            reasonDescription: error.message,
            telemetry: { llmCalls: [], toolCalls: [], messageHistory: [] },
          },
        };
      }
      throw error;
    }

    const response: AnswerPromptResponse = await this.aiInsightFacade.answerPrompt({
      projectId: input.projectId,
      dataMartId: input.dataMartId,
      prompt: input.prompt,
      wholeTemplate: input.wholeTemplate,
      options: input.options,
    });

    return {
      rendered: this.computeRendered(response),
      meta: {
        prompt: response.meta.prompt,
        status: response.status,
        reasonDescription: response.meta.reasonDescription,
        artifact: response.meta.artifact,
        telemetry: response.meta.telemetry as AgentTelemetry,
      },
    };
  }

  private computeRendered(response: AnswerPromptResponse) {
    if (isPromptAnswerOk(response.status)) {
      return response.promptAnswer!;
    }

    const prompt = `_Prompt:_ ${wrapCodeBlock(trimString(response.meta.prompt, 55))}`;
    const promptAnswer = `${prompt}  \n${response.meta.reasonDescription!}`;

    return isPromptAnswerError(response.status)
      ? wrapCautionBlock(promptAnswer)
      : wrapWarningBlock(promptAnswer);
  }
}
