export class ListCustomConnectorSummariesCommand {
  constructor(
    public readonly projectId: string,
    public readonly names?: string[]
  ) {}
}
