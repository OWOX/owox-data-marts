import { Injectable, Logger } from '@nestjs/common';
import { Agent, DataMartInsightsContext, SharedAgentContext } from '../ai-insights-types';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import {
  SqlErrorAdvisorInput,
  SqlErrorAdvisorResponse,
  SqlErrorAdvisorResponseSchema,
} from './types';
import {
  buildSqlErrorAdvisorSystemPrompt,
  buildSqlErrorAdvisorUserPrompt,
} from '../prompts/sql-error-advisor.prompt';

@Injectable()
export class SqlErrorAdvisorAgent implements Agent<SqlErrorAdvisorInput, SqlErrorAdvisorResponse> {
  readonly name = 'SqlErrorAdvisorAgent';
  private readonly logger = new Logger(SqlErrorAdvisorAgent.name);

  constructor(private readonly toolRegistry: ToolRegistry) {}

  async run(
    input: SqlErrorAdvisorInput,
    shared: SharedAgentContext
  ): Promise<SqlErrorAdvisorResponse> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildSqlErrorAdvisorSystemPrompt();
    const user = buildSqlErrorAdvisorUserPrompt({
      prompt: input.prompt,
      sql: input.sql,
      sqlError: input.sqlStepError.message,
      errorKind: input.sqlStepError.kind,
      dryRunBytes: input.sqlStepError.bytes,
      plan: input.queryPlan,
      rawSchema: input.schema,
    });

    const initialMessages: AiMessage[] = [
      { role: AiRole.SYSTEM, content: system },
      { role: AiRole.USER, content: user },
    ];

    const context: DataMartInsightsContext = {
      projectId,
      dataMartId,
      prompt: input.prompt,
      telemetry,
      budgets,
    };

    const { result } = await runAgentLoop({
      aiProvider,
      toolRegistry: this.toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools: [],
      maxTurns: 1,
      temperature: 0.3,
      maxTokens: 1500,
      resultSchema: SqlErrorAdvisorResponseSchema,
      logger: this.logger,
    });

    return result;
  }
}
