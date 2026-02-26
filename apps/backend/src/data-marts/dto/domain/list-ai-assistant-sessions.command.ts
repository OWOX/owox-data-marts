import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';

export class ListAiAssistantSessionsCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly scope: AiAssistantScope,
    public readonly templateId?: string | null,
    public readonly limit?: number,
    public readonly offset?: number
  ) {}
}
