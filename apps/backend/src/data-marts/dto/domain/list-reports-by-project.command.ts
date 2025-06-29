export class ListReportsByProjectCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string
  ) {}
}
