import { AnswerPromptRequest, AnswerPromptResponse } from '../ai-insights-types';

/**
 * Facade interface for AI Insights operations.
 */
export interface AiInsightsFacade {
  /**
   * Answers a prompt using AI Insights.
   * @param request
   */
  answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse>;
}
