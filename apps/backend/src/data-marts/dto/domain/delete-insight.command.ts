export class DeleteInsightCommand {
  constructor(
    public readonly insightId: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
