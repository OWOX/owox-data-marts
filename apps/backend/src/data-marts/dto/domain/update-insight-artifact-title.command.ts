export class UpdateInsightArtifactTitleCommand {
  constructor(
    public readonly insightArtifactId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly title: string
  ) {}
}
