export class GetInsightCommand {
  constructor(
    public readonly insightId: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
