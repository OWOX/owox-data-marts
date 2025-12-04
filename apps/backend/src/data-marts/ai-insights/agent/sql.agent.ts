import {
  Agent,
  DataMartInsightsContext,
  SharedAgentContext,
  SqlDryRunOutput,
  SqlDryRunOutputSchema,
  SqlExecuteOutput,
  SqlExecuteOutputSchema,
} from '../ai-insights-types';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import { DataMartsAiInsightsTools } from '../tools/data-marts-ai-insights-tools.registrar';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { Injectable, Logger } from '@nestjs/common';
import { SqlAgentInput, SqlAgentResponseSchema, SqlAgentResult } from './types';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { extractToolResult } from '../utils/extract-tool-result';
import { buildSqlSystemPrompt, buildSqlUserPrompt } from '../prompts/sql.prompt';
import { buildSqlExecuteMessageProcessor } from '../utils/sql-execute-message-processor';

@Injectable()
export class SqlAgent implements Agent<SqlAgentInput, SqlAgentResult> {
  readonly name = 'SqlAgent';
  private readonly logger = new Logger(SqlAgent.name);

  constructor(private readonly toolRegistry: ToolRegistry) {}

  async run(input: SqlAgentInput, shared: SharedAgentContext): Promise<SqlAgentResult> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildSqlSystemPrompt(budgets);
    const user = buildSqlUserPrompt(input);

    const tools = this.toolRegistry.findToolByNames([
      DataMartsAiInsightsTools.SQL_DRY_RUN,
      DataMartsAiInsightsTools.SQL_EXECUTE,
    ]);

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

    const { result: sqlAgentResponse, toolExecutions } = await runAgentLoop({
      aiProvider,
      toolRegistry: this.toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools,
      maxTurns: 10,
      temperature: 0,
      maxTokens: 8000,
      resultSchema: SqlAgentResponseSchema,
      logger: this.logger,
      messageProcessors: {
        [DataMartsAiInsightsTools.SQL_EXECUTE]: buildSqlExecuteMessageProcessor(),
      },
    });

    const dryRun: SqlDryRunOutput = extractToolResult(
      toolExecutions,
      DataMartsAiInsightsTools.SQL_DRY_RUN,
      SqlDryRunOutputSchema
    );

    const execute: SqlExecuteOutput = extractToolResult(
      toolExecutions,
      DataMartsAiInsightsTools.SQL_EXECUTE,
      SqlExecuteOutputSchema
    );

    return {
      status: sqlAgentResponse.status,
      sql: sqlAgentResponse.sql,
      dryRunBytes: dryRun.bytes,
      rows: execute.rows,
    };
  }
}
