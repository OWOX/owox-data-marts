export interface SqlRunColumnMetadata {
  name?: string | null;
  label?: string | null;
  typeName?: string | null;
}

export class SqlRunBatch<Row = Record<string, unknown>> {
  constructor(
    public readonly rows: Row[],
    public readonly nextBatchId?: string | null,
    public readonly columns?: string[] | null,
    public readonly columnMetadata?: SqlRunColumnMetadata[] | null
  ) {}
}
