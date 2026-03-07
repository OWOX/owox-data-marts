import {
  Agent,
  DataMartInsightsAgentLoopContext,
  GetMetadataOutput,
  SharedAgentContext,
} from '../ai-insights-types';
import { Injectable, Logger } from '@nestjs/common';
import {
  buildTriageContextSystemPrompt,
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
} from '../prompts/triage.prompt';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { AgentConversationContext, TriageModelJsonSchema, TriageResult } from './types';
import { buildAgentInitialMessages } from '../utils/build-agent-initial-messages';

export interface TriageAgentInput {
  prompt: string;
  prefetchedMetadata: GetMetadataOutput;
  conversationContext?: AgentConversationContext;
}

@Injectable()
export class TriageAgent implements Agent<TriageAgentInput, TriageResult> {
  readonly name = 'TriageAgent';
  private readonly logger = new Logger(TriageAgent.name);

  async run(input: TriageAgentInput, shared: SharedAgentContext): Promise<TriageResult> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildTriageSystemPrompt();
    const contextSystem = buildTriageContextSystemPrompt(input);
    const user = buildTriageUserPrompt(input);

    const initialMessages = buildAgentInitialMessages({
      systemPrompt: system,
      contextSystemPrompt: contextSystem,
      conversationTurns: input.conversationContext?.turns,
      userPrompt: user,
    });

    const context: DataMartInsightsAgentLoopContext = {
      projectId,
      dataMartId,
      prompt: input.prompt,
      telemetry,
      budgets,
    };

    const { result: triageAgentResponse } = await runAgentLoop({
      aiProvider,
      toolRegistry: shared.toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools: [],
      maxTurns: 1,
      temperature: 0,
      maxTokens: 3000,
      resultSchema: TriageModelJsonSchema,
      logger: this.logger,
    });

    return {
      outcome: triageAgentResponse.outcome,
      promptLanguage: triageAgentResponse.promptLanguage,
      reasonText: triageAgentResponse.reasonText ?? undefined,
      schemaSummary: triageAgentResponse.schemaSummary ?? undefined,
      rawSchema: input.prefetchedMetadata,
    };
  }
}
