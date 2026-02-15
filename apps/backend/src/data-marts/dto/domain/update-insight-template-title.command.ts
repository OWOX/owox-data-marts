export class UpdateInsightTemplateTitleCommand {
  constructor(
    public readonly insightTemplateId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly title: string
  ) {}
}
