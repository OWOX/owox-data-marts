export class SqlRunCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly sql?: string,
    public readonly maxRowsPerBatch?: number
  ) {}
}
