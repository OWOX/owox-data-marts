export class GetInsightArtifactCommand {
  constructor(
    public readonly insightArtifactId: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
