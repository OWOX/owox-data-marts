export class ReportDataBatch {
  constructor(
    public readonly dataRows: unknown[][],
    public readonly nextDataBatchId?: string | null
  ) {}
}
