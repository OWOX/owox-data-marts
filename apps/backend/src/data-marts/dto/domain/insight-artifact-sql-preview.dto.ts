export class InsightArtifactSqlPreviewDto {
  constructor(
    public readonly columns: string[],
    public readonly rows: unknown[][],
    public readonly rowCount: number,
    public readonly limit: number
  ) {}
}
