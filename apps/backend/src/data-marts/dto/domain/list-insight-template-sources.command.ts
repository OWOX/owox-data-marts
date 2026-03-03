export class ListInsightTemplateSourcesCommand {
  constructor(
    public readonly insightTemplateId: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
