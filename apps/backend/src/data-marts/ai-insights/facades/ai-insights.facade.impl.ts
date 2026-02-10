import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiInsightsFacade } from './ai-insights.facade';

import {
  AnswerPromptRequest,
  AnswerPromptResponse,
  GenerateInsightRequest,
  GenerateInsightResponse,
  SharedAgentContext,
} from '../ai-insights-types';
import { AiInsightsOrchestratorService } from '../ai-insight-orchestrator.service';
import { DataMartPromptMetaEntry, PromptAnswer } from '../data-mart-insights.types';
import { GenerateInsightAgent } from '../agent/generate-insight.agent';
import { AI_CHAT_PROVIDER } from '../../../common/ai-insights/services/ai-chat-provider.token';
import { AiChatProvider } from '../../../common/ai-insights/agent/ai-core';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { AiContentFilterError } from '../../../common/ai-insights/services/error';
import { castError } from '@owox/internal-helpers';

@Injectable()
export class AiInsightsFacadeImpl implements AiInsightsFacade {
  private readonly logger = new Logger(AiInsightsFacadeImpl.name);

  constructor(
    private readonly aiInsightsAgentService: AiInsightsOrchestratorService,
    private readonly generateInsightAgent: GenerateInsightAgent,
    @Inject(AI_CHAT_PROVIDER)
    private readonly aiProvider: AiChatProvider,
    private readonly toolRegistry: ToolRegistry
  ) {}

  async answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse> {
    try {
      return await this.aiInsightsAgentService.answerPrompt(request);
    } catch (e: unknown) {
      this.logger.error(`Unhandled error when processing prompt`, e, {
        projectId: request.projectId,
        dataMartId: request.dataMartId,
        prompt: request.prompt,
      });

      return {
        status: PromptAnswer.ERROR,
        meta: {
          prompt: request.prompt,
          sanitizedPrompt: null,
          reasonDescription: this.computeReasonDescription(castError(e)),
          telemetry: {
            llmCalls: [],
            toolCalls: [],
            messageHistory: [],
          },
        },
      };
    }
  }

  private computeReasonDescription(e: Error) {
    return e instanceof AiContentFilterError
      ? 'AI content filter error'
      : 'Something went wrong while processing the prompt. Try again later or contact us.';
  }

  async generateInsight(request: GenerateInsightRequest): Promise<GenerateInsightResponse> {
    this.logger.log(`Generating insight for data mart ${request.dataMartId}`);

    try {
      // Build shared context for the agent
      const sharedContext: SharedAgentContext = {
        aiProvider: this.aiProvider,
        toolRegistry: this.toolRegistry,
        budgets: {},
        telemetry: {
          llmCalls: [],
          toolCalls: [],
          messageHistory: [],
        },
        projectId: request.projectId,
        dataMartId: request.dataMartId,
      };

      // Call the AI agent to generate insight title and template
      const aiResult = await this.generateInsightAgent.run(
        {
          dataMartTitle: request.dataMartTitle,
          dataMartDescription: request.dataMartDescription,
          schema: request.schema,
        },
        sharedContext
      );

      this.logger.log(`AI generated insight title: "${aiResult.title}"`);

      const prompts: DataMartPromptMetaEntry[] = [
        {
          payload: {
            projectId: request.projectId,
            dataMartId: request.dataMartId,
            prompt: 'generate insight',
          },
          promptAnswer: JSON.stringify(aiResult),
          meta: {
            prompt: 'generate insight',
            sanitizedPrompt: null,
            status: PromptAnswer.OK,
            telemetry: sharedContext.telemetry,
          },
        },
      ];

      return {
        title: aiResult.title,
        template: aiResult.template,
        prompts,
      };
    } catch (e: unknown) {
      this.logger.error(`Error generating insight for data mart ${request.dataMartId}`, e);
      throw e;
    }
  }
}
