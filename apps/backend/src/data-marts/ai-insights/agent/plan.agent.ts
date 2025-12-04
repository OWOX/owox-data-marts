import { Agent, DataMartInsightsContext, SharedAgentContext } from '../ai-insights-types';
import { Injectable, Logger } from '@nestjs/common';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import { DataMartsAiInsightsTools } from '../tools/data-marts-ai-insights-tools.registrar';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';
import { PlanAgentInput, PlanAgentResult, PlanModelJsonSchema } from './types';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { buildPlanSystemPrompt, buildPlanUserPrompt } from '../prompts/plan.prompt';

@Injectable()
export class PlanAgent implements Agent<PlanAgentInput, PlanAgentResult> {
  readonly name = 'PlanAgent';
  private readonly logger = new Logger(PlanAgent.name);

  constructor(private readonly toolRegistry: ToolRegistry) {}

  async run(input: PlanAgentInput, shared: SharedAgentContext): Promise<PlanAgentResult> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildPlanSystemPrompt();
    const user = buildPlanUserPrompt(input);

    const tools = this.toolRegistry.findToolByNames([
      DataMartsAiInsightsTools.GET_TABLE_FULLY_QUALIFIED_NAME,
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

    const { result: planAgentResponse } = await runAgentLoop({
      aiProvider,
      toolRegistry: this.toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools,
      maxTurns: 6,
      temperature: 0.1,
      maxTokens: 3000,
      resultSchema: PlanModelJsonSchema,
      logger: this.logger,
    });

    return {
      plan: planAgentResponse.plan,
      maybeAmbiguous: planAgentResponse.maybeAmbiguous ?? false,
      ambiguityExplanation: planAgentResponse.ambiguityExplanation ?? undefined,
    };
  }
}
