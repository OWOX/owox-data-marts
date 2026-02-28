export class DeleteInsightTemplateSourceCommand {
  constructor(
    public readonly sourceId: string,
    public readonly insightTemplateId: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
