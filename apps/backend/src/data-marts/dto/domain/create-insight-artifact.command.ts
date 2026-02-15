export class CreateInsightArtifactCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly sql: string
  ) {}
}
