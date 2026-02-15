export class RunInsightArtifactSqlPreviewCommand {
  constructor(
    public readonly insightArtifactId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly sql?: string,
    public readonly limit: number = 10
  ) {}
}
