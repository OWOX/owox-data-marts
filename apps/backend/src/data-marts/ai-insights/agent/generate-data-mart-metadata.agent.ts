import { Agent, SharedAgentContext } from '../ai-insights-types';
import { Injectable, Logger } from '@nestjs/common';
import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import {
  GenerateDataMartMetadataAgentInput,
  GenerateDataMartMetadataAgentResponse,
  GenerateDataMartMetadataAgentResponseSchema,
} from './types';
import { runAgentLoop } from '../../../common/ai-insights/llm-tool-runner';
import {
  buildGenerateDataMartMetadataSystemPrompt,
  buildGenerateDataMartMetadataUserPrompt,
} from '../prompts/generate-data-mart-metadata.prompt';

@Injectable()
export class GenerateDataMartMetadataAgent implements Agent<
  GenerateDataMartMetadataAgentInput,
  GenerateDataMartMetadataAgentResponse
> {
  readonly name = 'GenerateDataMartMetadataAgent';
  private readonly logger = new Logger(GenerateDataMartMetadataAgent.name);

  async run(
    input: GenerateDataMartMetadataAgentInput,
    shared: SharedAgentContext
  ): Promise<GenerateDataMartMetadataAgentResponse> {
    const { aiProvider, toolRegistry, telemetry, budgets, projectId, dataMartId } = shared;

    const system = buildGenerateDataMartMetadataSystemPrompt();
    const user = buildGenerateDataMartMetadataUserPrompt(input);

    const initialMessages: AiMessage[] = [
      { role: AiRole.SYSTEM, content: system },
      { role: AiRole.USER, content: user },
    ];

    const context = {
      projectId,
      dataMartId,
      prompt: `generate data mart metadata: ${input.scope}`,
      telemetry,
      budgets,
    };

    const { result } = await runAgentLoop({
      aiProvider,
      toolRegistry,
      context,
      telemetry,
      initialMessages,
      tools: [],
      maxTurns: 1,
      temperature: 0.3,
      resultSchema: GenerateDataMartMetadataAgentResponseSchema,
      logger: this.logger,
    });

    return result;
  }
}
