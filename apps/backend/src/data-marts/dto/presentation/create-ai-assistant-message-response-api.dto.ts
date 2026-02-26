import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AssistantOrchestratorResponse } from '../../ai-insights/agent-flow/ai-assistant-types';
import { AiAssistantMessageResponseApiDto } from './ai-assistant-message-response-api.dto';

export enum AiAssistantExecutionModeApi {
  LIGHTWEIGHT = 'lightweight',
  HEAVY = 'heavy',
}

export class CreateAiAssistantMessageResponseApiDto {
  @ApiProperty({
    enum: AiAssistantExecutionModeApi,
    enumName: 'AiAssistantExecutionModeApi',
    example: AiAssistantExecutionModeApi.LIGHTWEIGHT,
  })
  mode: AiAssistantExecutionModeApi;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Trigger id for heavy route execution',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  triggerId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Lightweight assistant response payload',
    example: {
      status: 'cannot_answer',
      decision: 'explain_or_status',
      explanation: 'AI source orchestration is not configured yet.',
      meta: {
        lastUserMessage: 'Build SQL source',
        sanitizedLastUserMessage: 'Build SQL source',
        reasonDescription: 'Session API endpoint is available.',
        telemetry: { llmCalls: [], toolCalls: [], messageHistory: [] },
      },
    },
  })
  response?: AssistantOrchestratorResponse | null;

  @ApiProperty({ type: AiAssistantMessageResponseApiDto })
  userMessage: AiAssistantMessageResponseApiDto;

  @ApiPropertyOptional({ type: AiAssistantMessageResponseApiDto, nullable: true })
  assistantMessage?: AiAssistantMessageResponseApiDto | null;
}
