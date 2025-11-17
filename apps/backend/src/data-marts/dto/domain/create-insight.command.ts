export class CreateInsightCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly template?: string
  ) {}
}
