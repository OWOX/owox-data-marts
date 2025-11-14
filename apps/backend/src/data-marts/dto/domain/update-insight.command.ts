export class UpdateInsightCommand {
  constructor(
    public readonly insightId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly title?: string,
    public readonly template?: string
  ) {}
}
