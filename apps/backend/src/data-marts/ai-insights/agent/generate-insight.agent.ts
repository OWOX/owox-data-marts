import { Agent, SharedAgentContext } from '../ai-insights-types';
import { Injectable, Logger } from '@nestjs/common';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import {
  InsightGenerationAgentInput,
  InsightGenerationAgentResponse,
  InsightGenerationAgentResponseSchema,
} from './types';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import {
  buildGenerateInsightSystemPrompt,
  buildGenerateInsightUserPrompt,
} from '../prompts/generate-insight.prompt';

@Injectable()
export class GenerateInsightAgent implements Agent<
  InsightGenerationAgentInput,
  InsightGenerationAgentResponse
> {
  readonly name = 'GenerateInsightAgent';
  private readonly logger = new Logger(GenerateInsightAgent.name);

  async run(
    input: InsightGenerationAgentInput,
    shared: SharedAgentContext
  ): Promise<InsightGenerationAgentResponse> {
    const { aiProvider, toolRegistry, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildGenerateInsightSystemPrompt();
    const user = buildGenerateInsightUserPrompt(input);

    const initialMessages: AiMessage[] = [
      { role: AiRole.SYSTEM, content: system },
      { role: AiRole.USER, content: user },
    ];

    const context = {
      projectId,
      dataMartId,
      prompt: 'generate insight',
      telemetry,
      budgets,
    };

    const { result } = await runAgentLoop({
      aiProvider,
      toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools: [], // No tools needed for this agent
      maxTurns: 1,
      temperature: 0.7, // Higher temperature for more creative titles and templates
      resultSchema: InsightGenerationAgentResponseSchema,
      logger: this.logger,
    });

    return {
      title: result.title,
      template: result.template,
    };
  }
}
