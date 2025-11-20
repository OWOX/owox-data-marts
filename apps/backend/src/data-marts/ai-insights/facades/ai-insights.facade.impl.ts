import { Injectable } from '@nestjs/common';
import { AiInsightsFacade } from './ai-insights.facade';

import { AiInsightsAgentService } from '../agent.service';
import { AnswerPromptRequest, AnswerPromptResponse } from '../ai-insights-types';

@Injectable()
export class AiInsightsFacadeImpl implements AiInsightsFacade {
  constructor(private readonly aiInsightsAgentService: AiInsightsAgentService) {}

  async answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse> {
    return await this.aiInsightsAgentService.answerPrompt(request);
  }
}
