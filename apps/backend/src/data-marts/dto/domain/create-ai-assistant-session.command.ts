export class CreateAiAssistantSessionCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly templateId?: string | null
  ) {}
}
