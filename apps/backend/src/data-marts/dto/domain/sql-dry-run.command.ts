export class SqlDryRunCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly sql: string,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
