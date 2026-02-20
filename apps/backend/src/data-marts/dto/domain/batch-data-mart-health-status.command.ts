export class BatchDataMartHealthStatusCommand {
  constructor(
    public readonly projectId: string,
    public readonly ids: string[]
  ) {}
}
