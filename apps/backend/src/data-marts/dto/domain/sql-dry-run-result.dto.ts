export class SqlDryRunResult {
  constructor(
    public readonly isValid: boolean,
    public readonly error?: string,
    public readonly bytes?: number,
    /** Result column name to declared-type name. Only BigQuery fills it. */
    public readonly columnTypes?: ReadonlyMap<string, string>
  ) {}

  public static success(
    bytes?: number,
    columnTypes?: ReadonlyMap<string, string>
  ): SqlDryRunResult {
    return new SqlDryRunResult(true, undefined, bytes, columnTypes);
  }

  public static failed(error: string): SqlDryRunResult {
    return new SqlDryRunResult(false, error);
  }
}
