export class SummarizeMcpDataCatalogCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
