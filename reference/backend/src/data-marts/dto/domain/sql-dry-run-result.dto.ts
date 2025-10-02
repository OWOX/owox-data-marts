export class SqlDryRunResult {
  constructor(
    public readonly isValid: boolean,
    public readonly error?: string,
    public readonly bytes?: number
  ) {}

  public static success(bytes?: number): SqlDryRunResult {
    return new SqlDryRunResult(true, undefined, bytes);
  }

  public static failed(error: string): SqlDryRunResult {
    return new SqlDryRunResult(false, error);
  }
}
