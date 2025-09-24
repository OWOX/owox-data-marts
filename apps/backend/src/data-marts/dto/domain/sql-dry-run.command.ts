export class SqlDryRunCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly sql: string
  ) {}
}
