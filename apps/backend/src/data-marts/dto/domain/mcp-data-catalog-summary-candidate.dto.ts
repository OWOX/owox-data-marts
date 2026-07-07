export class McpDataCatalogSummaryCandidateDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly description: string | null,
    public readonly reportsCount: number,
    public readonly triggersCount: number,
    public readonly modifiedAt: Date
  ) {}
}
