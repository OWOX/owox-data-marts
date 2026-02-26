export class UpdateAiAssistantSessionTitleCommand {
  constructor(
    public readonly sessionId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string
  ) {}
}
