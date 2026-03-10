import { AiAssistantResponse } from '../../ai-insights/agent-flow/ai-assistant-types';
import { AiAssistantMessageDto } from './ai-assistant-message.dto';

export enum AiAssistantExecutionMode {
  LIGHTWEIGHT = 'lightweight',
  HEAVY = 'heavy',
}

export class AiAssistantMessageResultDto {
  constructor(
    public readonly mode: AiAssistantExecutionMode,
    public readonly triggerId: string | null,
    public readonly response: AiAssistantResponse | null,
    public readonly userMessage: AiAssistantMessageDto,
    public readonly assistantMessage: AiAssistantMessageDto | null
  ) {}
}
