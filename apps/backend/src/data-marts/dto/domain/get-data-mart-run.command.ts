export class GetDataMartRunCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly runId: string
  ) {}
}
