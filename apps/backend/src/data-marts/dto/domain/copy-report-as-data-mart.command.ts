export class CopyReportAsDataMartCommand {
  constructor(
    public readonly reportId: string,
    public readonly userId: string,
    public readonly projectId: string,
    public readonly roles: string[]
  ) {}
}
