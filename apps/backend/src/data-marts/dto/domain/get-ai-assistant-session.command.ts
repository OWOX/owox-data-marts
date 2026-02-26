export class GetAiAssistantSessionCommand {
  constructor(
    public readonly sessionId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string
  ) {}
}
