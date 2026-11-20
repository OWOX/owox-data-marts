import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

// DuckDB's `AT TIME ZONE` is direction-sensitive and NOT a drop-in mirror of
// Trino/Athena's: on a naive TIMESTAMP it means "interpret this wall-clock value as
// being IN zone z" (→ TIMESTAMPTZ) — the OPPOSITE of "shift a stored UTC instant into
// zone z's calendar view". A live DuckDB instance is the only reliable oracle for which
// expression form actually buckets correctly, so this spec pins the exact boundary
// behaviour `renderDateTrunc` must produce (see the implementation comment for the
// live-verified single-shift-vs-double-shift determination).
describe('DuckDbClauseRenderer.renderDateTrunc — live DuckDB timezone bucketing oracle', () => {
  it('AT TIME ZONE shifts a boundary instant into the expected local day (live DuckDB)', async () => {
    const instance = await createProductionDuckDbInstance();
    const connection = await instance.connect();
    try {
      const r = new DuckDbClauseRenderer();
      // 2024-03-01 02:00:00, read as a UTC instant, is 2024-02-29 21:00 in
      // America/New_York (UTC-5 in March, before that year's DST switch) — the prior
      // calendar day.
      const expr = r.renderDateTrunc(`TIMESTAMP '2024-03-01 02:00:00'`, 'DAY', 'America/New_York');
      const reader = await connection.runAndReadAll(`SELECT (${expr})::VARCHAR AS b`);
      const bucket = String(reader.getRowObjects()[0].b);
      expect(bucket.startsWith('2024-02-29')).toBe(true); // shifted into the prior local day, not 2024-03-01
    } finally {
      connection?.closeSync?.();
      instance?.closeSync?.();
    }
  });

  it('MONTH bucket also shifts across a month boundary (live DuckDB)', async () => {
    const instance = await createProductionDuckDbInstance();
    const connection = await instance.connect();
    try {
      const r = new DuckDbClauseRenderer();
      // 2024-01-01 00:30:00 UTC is 2023-12-31 19:30 in America/New_York (UTC-5) — the
      // month bucket must fall back into December, not January.
      const expr = r.renderDateTrunc(
        `TIMESTAMP '2024-01-01 00:30:00'`,
        'MONTH',
        'America/New_York'
      );
      const reader = await connection.runAndReadAll(`SELECT (${expr})::VARCHAR AS b`);
      const bucket = String(reader.getRowObjects()[0].b);
      expect(bucket.startsWith('2023-12-01')).toBe(true);
    } finally {
      connection?.closeSync?.();
      instance?.closeSync?.();
    }
  });

  it.each([
    // 23:30 UTC is already the next day in Kyiv (UTC+2) and still the same day in Los Angeles.
    ['Europe/Kyiv', '2024-03-01 23:30:00+00', '2024-03-02 00:00:00'],
    ['America/Los_Angeles', '2024-03-01 23:30:00+00', '2024-03-01 00:00:00'],
    // 00:30 UTC is still the previous day in Los Angeles (UTC-8) and the same day in Kyiv.
    ['Europe/Kyiv', '2024-03-02 00:30:00+00', '2024-03-02 00:00:00'],
    ['America/Los_Angeles', '2024-03-02 00:30:00+00', '2024-03-01 00:00:00'],
  ])(
    'buckets the TIMESTAMPTZ instant into the %s local day (%s), whatever the session zone',
    async (timeZone, instant, expectedDay) => {
      const instance = await createProductionDuckDbInstance();
      const connection = await instance.connect();
      try {
        const r = new DuckDbClauseRenderer();
        const expr = r.renderDateTrunc(`TIMESTAMPTZ '${instant}'`, 'DAY', timeZone, 'TIMESTAMPTZ');
        const reader = await connection.runAndReadAll(
          `SELECT (${expr})::VARCHAR AS b, typeof(${expr}) AS t`
        );
        // A naive result is printed without the session zone, so the bucket cannot depend on it.
        expect(reader.getRowObjects()[0]).toEqual({ b: expectedDay, t: 'TIMESTAMP' });
      } finally {
        connection?.closeSync?.();
        instance?.closeSync?.();
      }
    }
  );

  it('converts a TIMESTAMPTZ once and keeps the double conversion for a naive TIMESTAMP', () => {
    const r = new DuckDbClauseRenderer();
    expect(r.renderDateTrunc('"ts"', 'DAY', 'Europe/Kyiv', 'TIMESTAMPTZ')).toBe(
      `date_trunc('day', ("ts") AT TIME ZONE 'Europe/Kyiv')`
    );
    expect(r.renderDateTrunc('"ts"', 'DAY', 'Europe/Kyiv', 'TIMESTAMP')).toBe(
      `date_trunc('day', (("ts") AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Kyiv')`
    );
  });

  it('buckets a TIMESTAMPTZ without a time zone into the UTC day, not the session one', async () => {
    const instance = await createProductionDuckDbInstance();
    const connection = await instance.connect();
    try {
      const r = new DuckDbClauseRenderer();
      const expr = r.renderDateTrunc(
        `TIMESTAMPTZ '2024-03-01 23:30:00+00'`,
        'DAY',
        undefined,
        'TIMESTAMPTZ'
      );
      const reader = await connection.runAndReadAll(
        `SELECT (${expr})::VARCHAR AS b, typeof(${expr}) AS t`
      );
      expect(reader.getRowObjects()[0]).toEqual({ b: '2024-03-01 00:00:00', t: 'TIMESTAMP' });
    } finally {
      connection?.closeSync?.();
      instance?.closeSync?.();
    }
  });

  it.each([
    // 22:30 UTC + 1 hour is 23:30 UTC on 03-01, already 01:30 on 03-02 in Kyiv.
    ['TIMESTAMPTZ', `TIMESTAMPTZ '2024-03-01 22:30:00+00'`, undefined, '2024-03-01 00:00:00'],
    ['TIMESTAMPTZ', `TIMESTAMPTZ '2024-03-01 22:30:00+00'`, 'Europe/Kyiv', '2024-03-02 00:00:00'],
    ['TIMESTAMP', `TIMESTAMP '2024-03-01 22:30:00'`, 'Europe/Kyiv', '2024-03-02 00:00:00'],
  ])(
    'buckets a compound %s formula (%s + 1 hour, zone %s)',
    async (columnType, value, timeZone, expectedDay) => {
      const instance = await createProductionDuckDbInstance();
      const connection = await instance.connect();
      try {
        const r = new DuckDbClauseRenderer();
        const expr = r.renderDateTruncExpression(
          `${value} + INTERVAL 1 HOUR`,
          'DAY',
          timeZone,
          columnType
        );
        const reader = await connection.runAndReadAll(`SELECT (${expr})::VARCHAR AS b`);
        expect(reader.getRowObjects()[0]).toEqual({ b: expectedDay });
      } finally {
        connection?.closeSync?.();
        instance?.closeSync?.();
      }
    }
  );

  it('no timeZone leaves the value unshifted (UTC/naive bucketing)', async () => {
    const instance = await createProductionDuckDbInstance();
    const connection = await instance.connect();
    try {
      const r = new DuckDbClauseRenderer();
      const expr = r.renderDateTrunc(`TIMESTAMP '2024-03-01 02:00:00'`, 'DAY');
      expect(expr).not.toContain('AT TIME ZONE');
      const reader = await connection.runAndReadAll(`SELECT (${expr})::VARCHAR AS b`);
      const bucket = String(reader.getRowObjects()[0].b);
      expect(bucket.startsWith('2024-03-01')).toBe(true);
    } finally {
      connection?.closeSync?.();
      instance?.closeSync?.();
    }
  });
});
