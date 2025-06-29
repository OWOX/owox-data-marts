export class ListReportsByDataMartCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string
  ) {}
}
