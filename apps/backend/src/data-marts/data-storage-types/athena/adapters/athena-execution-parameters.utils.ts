import { SqlParameter } from '../../utils/sql-clause-renderer';

/**
 * Maps renderer SqlParameter[] (positional order) to Athena ExecutionParameters.
 *
 * Athena ExecutionParameters are NOT bound like JDBC values — each element is
 * substituted as a SQL literal/expression. Per AWS docs, "for SQL execution
 * parameters to be treated as strings, they must be enclosed in single quotes".
 * So strings are single-quoted ('' -escaped), numbers/booleans are bare literals,
 * and null becomes NULL. Do not change this to raw values — it would break every
 * string filter.
 * @see https://docs.aws.amazon.com/athena/latest/ug/querying-with-prepared-statements.html
 */
export function toAthenaExecutionParameters(
  params: SqlParameter[] | undefined
): string[] | undefined {
  if (!params || params.length === 0) return undefined;
  return params.map(p => formatLiteral(p.value));
}

function formatLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${value.split("'").join("''")}'`;
}
