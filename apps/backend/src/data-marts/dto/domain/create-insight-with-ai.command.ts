export class CreateInsightWithAiCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string
  ) {}
}
