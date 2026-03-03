export class UpdateInsightTemplateSourceCommand {
  constructor(
    public readonly sourceId: string,
    public readonly insightTemplateId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly title: string,
    public readonly sql: string
  ) {}
}
