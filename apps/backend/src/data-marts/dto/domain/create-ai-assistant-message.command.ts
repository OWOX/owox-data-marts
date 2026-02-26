export interface CreateAiAssistantMessageTurnContext {
  sourceKeyHint?: string;
  artifactIdHint?: string;
  preferredSnippetType?: 'table' | 'single_value';
}

export class CreateAiAssistantMessageCommand {
  constructor(
    public readonly sessionId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly text: string,
    public readonly correlationId?: string | null,
    public readonly turnContext?: CreateAiAssistantMessageTurnContext | null
  ) {}
}
