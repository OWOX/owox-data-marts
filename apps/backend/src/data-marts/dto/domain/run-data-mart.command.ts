export class RunDataMartCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly userId: string
  ) {}
}
