import { Agent, DataMartInsightsContext, SharedAgentContext } from '../ai-insights-types';
import { Injectable, Logger } from '@nestjs/common';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import {
  FinalizeAgentInput,
  FinalizeAgentResponse,
  FinalizeAgentResponseSchema,
  FinalizeResult,
  isFinalReasonAnswer,
} from './types';
import { buildFinalizeSystemPrompt, buildFinalizeUserPrompt } from '../prompts/finalize.prompt';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import { ToolRegistry } from '../../../common/ai-insights/agent/tool-registry';

@Injectable()
export class FinalizeAgent implements Agent<FinalizeAgentInput, FinalizeResult> {
  readonly name = 'FinalizeAgent';
  private readonly logger = new Logger(FinalizeAgent.name);

  constructor(private readonly toolRegistry: ToolRegistry) {}

  async run(input: FinalizeAgentInput, shared: SharedAgentContext): Promise<FinalizeResult> {
    const { aiProvider, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildFinalizeSystemPrompt();
    const user = buildFinalizeUserPrompt(input);

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

    const { result: finalizeAgentResponse } = await runAgentLoop({
      aiProvider,
      toolRegistry: this.toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools: [],
      maxTurns: 3,
      temperature: 0.2,
      maxTokens: 8000,
      resultSchema: FinalizeAgentResponseSchema,
      logger: this.logger,
    });

    return this.buildResponse(finalizeAgentResponse, input);
  }

  private buildResponse(finalizeAgentResponse: FinalizeAgentResponse, input: FinalizeAgentInput) {
    return isFinalReasonAnswer(finalizeAgentResponse.reason)
      ? {
          status: finalizeAgentResponse.reason,
          promptAnswer: finalizeAgentResponse.promptAnswer,
          artifact: input.sqlAgentResult.sql,
        }
      : {
          status: finalizeAgentResponse.reason,
          reasonDescription: finalizeAgentResponse.promptAnswer,
          artifact: input.sqlAgentResult.sql,
        };
  }
}
