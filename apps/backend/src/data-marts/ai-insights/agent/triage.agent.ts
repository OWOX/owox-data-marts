import {
  Agent,
  DataMartInsightsContext,
  GetMetadataOutput,
  GetMetadataOutputSchema,
  SharedAgentContext,
} from '../ai-insights-types';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { Injectable, Logger } from '@nestjs/common';
import { DataMartsAiInsightsTools } from '../tools/data-marts-ai-insights-tools.registrar';
import {
  buildTriageContextSystemPrompt,
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
} from '../prompts/triage.prompt';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { extractToolResult } from '../utils/extract-tool-result';
import { AgentConversationContext, TriageModelJsonSchema, TriageResult } from './types';
import { buildAgentInitialMessages } from '../utils/build-agent-initial-messages';

export interface TriageAgentInput {
  prompt: string;
  conversationContext?: AgentConversationContext;
}

@Injectable()
export class TriageAgent implements Agent<TriageAgentInput, TriageResult> {
  readonly name = 'TriageAgent';
  private readonly logger = new Logger(TriageAgent.name);

  constructor(private readonly toolRegistry: ToolRegistry) {}

  async run(input: TriageAgentInput, shared: SharedAgentContext): Promise<TriageResult> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildTriageSystemPrompt();
    const contextSystem = buildTriageContextSystemPrompt(input);
    const user = buildTriageUserPrompt(input);

    const tools = this.toolRegistry.findToolByNames([
      DataMartsAiInsightsTools.GET_DATAMART_METADATA,
    ]);

    const initialMessages = buildAgentInitialMessages({
      systemPrompt: system,
      contextSystemPrompt: contextSystem,
      conversationTurns: input.conversationContext?.turns,
      userPrompt: user,
    });

    const context: DataMartInsightsContext = {
      projectId,
      dataMartId,
      prompt: input.prompt,
      telemetry,
      budgets,
    };

    const { result: triageAgentResponse, toolExecutions } = await runAgentLoop({
      aiProvider,
      toolRegistry: this.toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools,
      maxTurns: 4,
      temperature: 0,
      maxTokens: 3000,
      resultSchema: TriageModelJsonSchema,
      logger: this.logger,
      executionPolicy: {
        rules: {
          [DataMartsAiInsightsTools.GET_DATAMART_METADATA]: {},
        },
      },
    });

    const schema: GetMetadataOutput = extractToolResult(
      toolExecutions,
      DataMartsAiInsightsTools.GET_DATAMART_METADATA,
      GetMetadataOutputSchema
    );

    return {
      outcome: triageAgentResponse.outcome,
      promptLanguage: triageAgentResponse.promptLanguage,
      reasonText: triageAgentResponse.reasonText ?? undefined,
      schemaSummary: triageAgentResponse.schemaSummary ?? undefined,
      rawSchema: schema,
    };
  }
}
