import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';

export class AiAssistantSessionListItemDto {
  constructor(
    public readonly id: string,
    public readonly dataMartId: string,
    public readonly scope: AiAssistantScope,
    public readonly title: string | null,
    public readonly templateId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}
}
