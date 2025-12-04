import { Injectable, Logger } from '@nestjs/common';
import { AiInsightsFacade } from './ai-insights.facade';

import { AnswerPromptRequest, AnswerPromptResponse } from '../ai-insights-types';
import { AiInsightsOrchestratorService } from '../ai-insight-orchestrator.service';
import { PromptAnswer } from '../data-mart-insights.types';

@Injectable()
export class AiInsightsFacadeImpl implements AiInsightsFacade {
  private readonly logger = new Logger(AiInsightsFacadeImpl.name);
  constructor(private readonly aiInsightsAgentService: AiInsightsOrchestratorService) {}

  async answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse> {
    try {
      return await this.aiInsightsAgentService.answerPrompt(request);
    } catch (e: unknown) {
      this.logger.error('Unhandled error when processing prompt', e);

      return {
        status: PromptAnswer.ERROR,
        meta: {
          prompt: request.prompt,
          reasonDescription:
            'Something went wrong while processing the prompt. Try again later or contact us.',
        },
      };
    }
  }
}
