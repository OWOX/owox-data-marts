export class UpdateInsightArtifactCommand {
  constructor(
    public readonly insightArtifactId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly title?: string,
    public readonly sql?: string
  ) {}
}
