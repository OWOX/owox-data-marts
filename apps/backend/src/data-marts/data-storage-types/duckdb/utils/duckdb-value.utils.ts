// Values outside this range would silently lose precision if coerced through Number(),
// so they are stringified instead (see `serializeDuckDbValue`). Compared in bigint space —
// never round-trip a lossy Number() conversion back through Number.isSafeInteger.
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

type DuckDbNodeApi = typeof import('@duckdb/node-api');

/** Normalizes a raw DuckDBValue (bigint / DuckDB temporal wrapper / Date) for a response payload. */
export function serializeDuckDbValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') {
    return value >= MIN_SAFE_BIGINT && value <= MAX_SAFE_BIGINT ? Number(value) : String(value);
  }
  if (value instanceof Date) return value.toISOString();
  // Only DuckDBDecimalValue has toDouble(); the schema declares DECIMAL columns DOUBLE.
  if (typeof (value as { toDouble?: unknown }).toDouble === 'function') {
    return (value as { toDouble(): number }).toDouble();
  }
  if (typeof value === 'object') {
    // Loaded here, not at import: a DuckDB value means the native binding is already in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DuckDBTimestampTZValue }: DuckDbNodeApi = require('@duckdb/node-api');
    // Its toString() prints the Node process's offset; an instant goes out in UTC instead.
    if (value instanceof DuckDBTimestampTZValue && value.isFinite) {
      const { micros } = value;
      const date = new Date(Number(micros / 1000n - (micros % 1000n < 0n ? 1n : 0n)));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    return String(value);
  }
  return value;
}
