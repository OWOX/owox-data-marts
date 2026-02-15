export class DeleteInsightArtifactCommand {
  constructor(
    public readonly insightArtifactId: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
