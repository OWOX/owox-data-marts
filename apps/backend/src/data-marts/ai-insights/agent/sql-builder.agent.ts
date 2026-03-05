import { Injectable, Logger } from '@nestjs/common';
import { Agent, DataMartInsightsContext, SharedAgentContext } from '../ai-insights-types';
import { AiMessage } from '../../../common/ai-insights/agent/ai-core';
import { SqlAgentInput, SqlBuilderResponse, SqlBuilderResponseSchema } from './types';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import {
  buildSqlBuilderContextSystemPrompt,
  buildSqlBuilderSystemPrompt,
  buildSqlBuilderUserPrompt,
} from '../prompts/sql-builder.prompt';
import { buildAgentInitialMessages } from '../utils/build-agent-initial-messages';

@Injectable()
export class SqlBuilderAgent implements Agent<SqlAgentInput, SqlBuilderResponse> {
  readonly name = 'SqlBuilderAgent';
  private readonly logger = new Logger(SqlBuilderAgent.name);

  async run(input: SqlAgentInput, shared: SharedAgentContext): Promise<SqlBuilderResponse> {
    const system = buildSqlBuilderSystemPrompt(shared.budgets);
    const contextSystem = buildSqlBuilderContextSystemPrompt(input);
    const user = buildSqlBuilderUserPrompt(input);
    const initialMessages = buildAgentInitialMessages({
      systemPrompt: system,
      contextSystemPrompt: contextSystem,
      conversationTurns: input.conversationContext?.turns,
      userPrompt: user,
    });

    return this.runLoop(shared, input, initialMessages);
  }

  private async runLoop(
    shared: SharedAgentContext,
    input: SqlAgentInput,
    initialMessages: AiMessage[]
  ): Promise<SqlBuilderResponse> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const context: DataMartInsightsContext = {
      projectId,
      dataMartId,
      prompt: input.prompt,
      telemetry,
      budgets,
    };

    const { result } = await runAgentLoop({
      aiProvider,
      toolRegistry: shared.toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools: [],
      maxTurns: 1,
      temperature: 0,
      maxTokens: 8000,
      resultSchema: SqlBuilderResponseSchema,
      logger: this.logger,
    });

    return result;
  }
}
