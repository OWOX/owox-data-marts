export class SqlRunBatch<Row = Record<string, unknown>> {
  constructor(
    public readonly rows: Row[],
    public readonly nextBatchId?: string | null,
    public readonly columns?: string[] | null
  ) {}
}
