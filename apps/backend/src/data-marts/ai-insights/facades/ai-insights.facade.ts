import {
  AnswerPromptRequest,
  AnswerPromptResponse,
  GenerateInsightRequest,
  GenerateInsightResponse,
} from '../ai-insights-types';

/**
 * Facade interface for AI Insights operations.
 */
export interface AiInsightsFacade {
  /**
   * Answers a prompt using AI Insights.
   * @param request
   */
  answerPrompt(request: AnswerPromptRequest): Promise<AnswerPromptResponse>;

  /**
   * Generates an insight (title and template) for a data mart using AI.
   * @param request
   */
  generateInsight(request: GenerateInsightRequest): Promise<GenerateInsightResponse>;
}
