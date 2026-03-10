import { Injectable, Logger } from '@nestjs/common';
import { Agent, DataMartInsightsAgentLoopContext, SharedAgentContext } from '../ai-insights-types';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';

import {
  buildQueryRepairSystemPrompt,
  buildQueryRepairUserPrompt,
} from '../prompts/query-repair.prompt';
import { QueryRepairInput, QueryRepairResponse, QueryRepairResponseSchema } from './types';
import { StorageRelatedPromptResolver } from '../prompts/storage-related-prompt.resolver';
import { StorageRelatedPromptSection } from '../prompts/storage-related-prompt.types';

@Injectable()
export class QueryRepairAgent implements Agent<QueryRepairInput, QueryRepairResponse> {
  readonly name = 'QueryRepairAgent';
  private readonly logger = new Logger(QueryRepairAgent.name);

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly storageRelatedPromptResolver: StorageRelatedPromptResolver
  ) {}

  async run(input: QueryRepairInput, shared: SharedAgentContext): Promise<QueryRepairResponse> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const storageRelatedPrompt = this.storageRelatedPromptResolver.resolve(
      StorageRelatedPromptSection.QUERY_REPAIR_SYSTEM,
      input.schema?.storageType
    );
    const system = buildQueryRepairSystemPrompt(budgets, storageRelatedPrompt);
    const user = buildQueryRepairUserPrompt({
      prompt: input.prompt,
      plan: input.queryPlan,
      rawSchema: input.schema,
      attempts: input.attempts,
    });

    const initialMessages: AiMessage[] = [
      { role: AiRole.SYSTEM, content: system },
      { role: AiRole.USER, content: user },
    ];

    const context: DataMartInsightsAgentLoopContext = {
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
      temperature: 0.2,
      maxTokens: 2500,
      resultSchema: QueryRepairResponseSchema,
      logger: this.logger,
    });

    return result;
  }
}
