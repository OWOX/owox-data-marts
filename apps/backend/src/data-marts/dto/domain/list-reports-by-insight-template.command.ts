export class ListReportsByInsightTemplateCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly insightTemplateId: string,
    public readonly projectId: string
  ) {}
}
