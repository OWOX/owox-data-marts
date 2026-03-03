export class CreateInsightTemplateSourceCommand {
  constructor(
    public readonly insightTemplateId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly key: string,
    public readonly title: string,
    public readonly sql: string
  ) {}
}
