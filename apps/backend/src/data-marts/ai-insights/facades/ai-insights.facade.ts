import {
  AnswerPromptRequest,
  AnswerPromptResponse,
  GenerateDataMartMetadataRequest,
  GenerateDataMartMetadataResponse,
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

  /**
   * Generates business-friendly metadata suggestions for a data mart
   * (title / description / per-field aliases / per-field descriptions).
   * The result is a suggestion only — it is NOT persisted by this method.
   * @param request
   */
  generateDataMartMetadata(
    request: GenerateDataMartMetadataRequest
  ): Promise<GenerateDataMartMetadataResponse>;
}
