import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { AiAssistantMessageDto } from './ai-assistant-message.dto';

export class AiAssistantSessionDto {
  constructor(
    public readonly id: string,
    public readonly dataMartId: string,
    public readonly scope: AiAssistantScope,
    public readonly title: string | null,
    public readonly templateId: string | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly messages: AiAssistantMessageDto[]
  ) {}
}
