export class CancelDataMartRunCommand {
  constructor(
    public readonly id: string,
    public readonly runId: string,
    public readonly projectId: string,
    public readonly userId: string
  ) {}
}
