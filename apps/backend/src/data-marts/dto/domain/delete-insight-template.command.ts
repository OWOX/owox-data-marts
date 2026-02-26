export class DeleteInsightTemplateCommand {
  constructor(
    public readonly insightTemplateId: string,
    public readonly dataMartId: string,
    public readonly projectId: string
  ) {}
}
