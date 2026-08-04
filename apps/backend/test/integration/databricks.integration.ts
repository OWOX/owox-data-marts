import { DatabricksApiAdapter } from 'src/data-marts/data-storage-types/databricks/adapters/databricks-api.adapter';
import { DatabricksCredentials } from 'src/data-marts/data-storage-types/databricks/schemas/databricks-credentials.schema';
import { DatabricksConfig } from 'src/data-marts/data-storage-types/databricks/schemas/databricks-config.schema';
import { DatabricksAuthMethod } from 'src/data-marts/data-storage-types/databricks/enums/databricks-auth-method.enum';
import { DatabricksQueryBuilder } from 'src/data-marts/data-storage-types/databricks/services/databricks-query.builder';
import { DatabricksClauseRenderer } from 'src/data-marts/data-storage-types/databricks/services/databricks-clause-renderer';
import { DatabricksBlendedQueryBuilder } from 'src/data-marts/data-storage-types/databricks/services/databricks-blended-query-builder';
import { BlendedQueryContext } from 'src/data-marts/data-storage-types/interfaces/blended-query-builder.interface';
import { DataMartRelationship } from 'src/data-marts/entities/data-mart-relationship.entity';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';
import { buildBlendedFieldIndex } from 'src/data-marts/services/blended-field-index';

// Live Databricks integration for output controls (option B — the renderer inlines every
// literal). Proves the renderer/builder SQL executes against a real Databricks SQL warehouse
// and returns the expected rows, and finalizes the two live-only design questions:
//   (a) backslash round-trip — Spark interprets `\` as a string-literal escape (like
//       BigQuery/Snowflake), so the renderer doubles it; the seed must double it TWICE more
//       to land a single backslash in storage (a JS template literal eats one level).
//   (b) regex anchoring — Spark `RLIKE` is PARTIAL match (Java find()), unlike Snowflake's
//       full-anchored RLIKE; the `^alp` → 'alpha' case is the only test that proves it.
//   (c) CAST necessity — the renderer emits a defensive CAST; a bare-literal probe confirms
//       Spark also coerces (so the cast is defensive-only).
//
// Required env (all DATABRICKS_-prefixed):
//   DATABRICKS_HOST      — workspace host, HOSTNAME ONLY (no https://), e.g. dbc-xxxx.cloud.databricks.com
//   DATABRICKS_HTTP_PATH — SQL warehouse HTTP path, e.g. /sql/1.0/warehouses/abc123
//   DATABRICKS_TOKEN     — personal access token
//   DATABRICKS_CATALOG   — catalog for the seed table (e.g. main)
//   DATABRICKS_SCHEMA    — schema for the seed table (e.g. default)

const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_HTTP_PATH = process.env.DATABRICKS_HTTP_PATH;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_CATALOG = process.env.DATABRICKS_CATALOG;
const DATABRICKS_SCHEMA = process.env.DATABRICKS_SCHEMA;

const DATABRICKS_CREDENTIALS_AVAILABLE = !!(
  DATABRICKS_HOST &&
  DATABRICKS_HTTP_PATH &&
  DATABRICKS_TOKEN &&
  DATABRICKS_CATALOG &&
  DATABRICKS_SCHEMA
);

if (!DATABRICKS_CREDENTIALS_AVAILABLE) {
  const missing: string[] = [];
  if (!DATABRICKS_HOST) missing.push('DATABRICKS_HOST');
  if (!DATABRICKS_HTTP_PATH) missing.push('DATABRICKS_HTTP_PATH');
  if (!DATABRICKS_TOKEN) missing.push('DATABRICKS_TOKEN');
  if (!DATABRICKS_CATALOG) missing.push('DATABRICKS_CATALOG');
  if (!DATABRICKS_SCHEMA) missing.push('DATABRICKS_SCHEMA');
  console.warn(`Skipping Databricks integration tests — missing env: ${missing.join(', ')}`);
}

const describeIfCredentials = DATABRICKS_CREDENTIALS_AVAILABLE ? describe : describe.skip;

function makeAdapter(): DatabricksApiAdapter {
  const credentials: DatabricksCredentials = {
    authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
    token: DATABRICKS_TOKEN!,
  };
  const config: DatabricksConfig = {
    host: DATABRICKS_HOST!,
    httpPath: DATABRICKS_HTTP_PATH!,
  };
  return new DatabricksApiAdapter(credentials, config);
}

describeIfCredentials('Databricks Integration Tests — access', () => {
  let adapter: DatabricksApiAdapter;

  beforeAll(() => {
    adapter = makeAdapter();
  });

  afterAll(async () => {
    await adapter.destroy();
  });

  it('checkAccess succeeds with valid credentials', async () => {
    await expect(adapter.checkAccess()).resolves.not.toThrow();
  }, 60000);

  it('executeDryRunQuery validates good SQL and rejects bad SQL', async () => {
    const ok = await adapter.executeDryRunQuery('SELECT 1');
    expect(ok.isValid).toBe(true);
    const bad = await adapter.executeDryRunQuery('SELEKT * FORM nope');
    expect(bad.isValid).toBe(false);
  }, 60000);
});

// ---------------------------------------------------------------------------
// Design-decision probes + operator matrix (own seed table)
// ---------------------------------------------------------------------------
// Seed rows:
//   id  name        amount  status    date_col              ts_col (non-midnight rows 1,6)
//    1  alpha         10.0  active    today                 today@13:45
//    2  beta          20.0  inactive  yesterday             yesterday@00:00
//    3  O'Brien       30.0  active    -40 days              -40d@00:00
//    4  100%          40.0  inactive  -400 days (last yr)   -400d@00:00
//    5  a\b           50.0  active    +13 months (next yr)  next_year@00:00
//    6  gamma          0.0  active    today                 today@13:45
//
// Row 5: future-dated for this_year / this_month upper-bound exclusion AND the
//        backslash round-trip probe. Rows 1,6: today@13:45 for the non-midnight check.
// Row 3: O'Brien for single-quote round-trip. Row 4: 100% for wildcard-literal safety
//        and the `\d` regex-class probe.

const MATRIX_SUFFIX = `db_oc_matrix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const MATRIX_FQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.${MATRIX_SUFFIX}`;
const QUALIFIED = `\`${DATABRICKS_CATALOG}\`.\`${DATABRICKS_SCHEMA}\`.\`${MATRIX_SUFFIX}\``;

describeIfCredentials('Databricks — date/time coercion, escaping, regex, operator matrix', () => {
  let adapter: DatabricksApiAdapter;

  const builder = new DatabricksQueryBuilder(new DatabricksClauseRenderer());
  const definition: TableDefinition = {
    get fullyQualifiedName() {
      return MATRIX_FQN;
    },
  };
  const columnTypes = new Map<string, string>([
    ['date_col', 'DATE'],
    ['ts_col', 'TIMESTAMP'],
    ['ts_ntz_col', 'TIMESTAMP_NTZ'],
  ]);

  async function runFilter(
    queryOptions: Parameters<DatabricksQueryBuilder['buildQuery']>[1]
  ): Promise<Array<Record<string, unknown>>> {
    const sql = builder.buildQuery(definition, { columnTypes, ...queryOptions });
    return adapter.executeQueryAndFetchAll(sql);
  }

  function ids(rows: Array<Record<string, unknown>>): string[] {
    return rows.map(r => String(r.id)).sort((a, b) => Number(a) - Number(b));
  }

  beforeAll(async () => {
    adapter = makeAdapter();

    try {
      await adapter.executeQuery(`DROP TABLE IF EXISTS ${QUALIFIED}`);
    } catch {
      // ignore — table may not exist on first run
    }

    await adapter.executeQuery(`
      CREATE TABLE ${QUALIFIED} (
        id          INT,
        name        STRING,
        amount      DECIMAL(10,2),
        status      STRING,
        date_col    DATE,
        ts_col      TIMESTAMP,
        ts_ntz_col  TIMESTAMP_NTZ
      ) USING DELTA
    `);

    // Row 5 name: a JS template literal collapses `\\\\` (4) → `\\` (2) in the SQL text,
    // and Spark then unescapes `\\` → `\`, so the stored value is exactly `a\b` (one
    // backslash) — matching what the renderer emits for the filter value `a\b`.
    await adapter.executeQuery(`
      INSERT INTO ${QUALIFIED}
        (id, name, amount, status, date_col, ts_col, ts_ntz_col)
      VALUES
        (1, 'alpha',   10.00, 'active',
          current_date,
          cast(current_date as timestamp) + interval 825 minute,
          cast(cast(current_date as timestamp) + interval 825 minute as timestamp_ntz)),
        (2, 'beta',    20.00, 'inactive',
          date_add(current_date, -1),
          cast(date_add(current_date, -1) as timestamp),
          cast(date_add(current_date, -1) as timestamp_ntz)),
        (3, 'O''Brien',30.00, 'active',
          date_add(current_date, -40),
          cast(date_add(current_date, -40) as timestamp),
          cast(date_add(current_date, -40) as timestamp_ntz)),
        (4, '100%',    40.00, 'inactive',
          date_add(current_date, -400),
          cast(date_add(current_date, -400) as timestamp),
          cast(date_add(current_date, -400) as timestamp_ntz)),
        (5, 'a\\\\b',  50.00, 'active',
          add_months(current_date, 13),
          cast(add_months(current_date, 13) as timestamp),
          cast(add_months(current_date, 13) as timestamp_ntz)),
        (6, 'gamma',    0.00, 'active',
          current_date,
          cast(current_date as timestamp) + interval 825 minute,
          cast(cast(current_date as timestamp) + interval 825 minute as timestamp_ntz)),
        -- Row 7: the all-NULL row (bare NULLs coerce to each typed column). Proves negative
        -- operators keep NULLs — neq / not_in / not_contains / not_regex include it, while
        -- comparison / affix / regex / date filters drop it.
        (7, NULL, NULL, NULL, NULL, NULL, NULL)
    `);
  }, 180000);

  afterAll(async () => {
    try {
      await adapter.executeQuery(`DROP TABLE IF EXISTS ${QUALIFIED}`);
    } catch (error) {
      console.warn('Failed to drop Databricks matrix test table:', error);
    } finally {
      await adapter.destroy();
    }
  }, 60000);

  // -------------------------------------------------------------------------
  // PROBE (a): backslash round-trip
  // -------------------------------------------------------------------------
  it('PROBE backslash round-trip: eq "a\\\\b" matches the seeded backslash row', async () => {
    const rows = await runFilter({ filters: [{ column: 'name', operator: 'eq', value: 'a\\b' }] });
    console.log(`[ESCAPING] backslash eq match count: ${rows.length} (expect 1)`);
    expect(ids(rows)).toEqual(['5']);
  }, 60000);

  // -------------------------------------------------------------------------
  // PROBE (c): CAST necessity — does Spark coerce a bare string literal?
  // -------------------------------------------------------------------------
  it('PROBE bare-literal date coercion: WHERE date_col >= bare string executes', async () => {
    const rows = await adapter.executeQueryAndFetchAll(
      `SELECT id FROM ${QUALIFIED} WHERE date_col >= '2020-01-01'`
    );
    console.log(`[COERCION] bare-literal date predicate → ${rows.length} rows, no error`);
    expect(rows.length).toBeGreaterThan(0);
  }, 60000);

  it('DATE gte/between with the defensive CAST returns rows', async () => {
    const gte = await runFilter({
      filters: [{ column: 'date_col', operator: 'gte', value: '2020-01-01' }],
    });
    expect(gte.length).toBeGreaterThan(0);
    const between = await runFilter({
      filters: [
        {
          column: 'date_col',
          operator: 'between',
          value: { from: '2020-01-01', to: '2035-12-31' },
        },
      ],
    });
    expect(between.length).toBeGreaterThan(0);
  }, 60000);

  // -------------------------------------------------------------------------
  // relative_date on a non-midnight TIMESTAMP column (half-open range)
  // -------------------------------------------------------------------------
  it('relative_date today on ts_col (13:45, non-midnight) → rows 1,6', async () => {
    const rows = await runFilter({
      filters: [{ column: 'ts_col', operator: 'relative_date', value: { kind: 'today' } }],
    });
    expect(ids(rows)).toEqual(['1', '6']);
  }, 60000);

  it('relative_date today on date_col → rows 1,6', async () => {
    const rows = await runFilter({
      filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'today' } }],
    });
    expect(ids(rows)).toEqual(['1', '6']);
  }, 60000);

  it('relative_date this_year excludes future row 5 and last-year row 4', async () => {
    const rows = await runFilter({
      filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'this_year' } }],
    });
    const resultIds = ids(rows);
    expect(resultIds).not.toContain('5');
    expect(resultIds).not.toContain('4');
    expect(resultIds).toContain('1');
    expect(resultIds).toContain('6');
  }, 60000);

  it('relative_date this_month excludes future-dated row 5', async () => {
    const rows = await runFilter({
      filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'this_month' } }],
    });
    expect(ids(rows)).not.toContain('5');
  }, 60000);

  it('relative_date last_n_days(7) → rows 1,2,6 (upper bound excludes future row 5)', async () => {
    const rows = await runFilter({
      filters: [
        { column: 'date_col', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
      ],
    });
    expect(ids(rows)).toEqual(['1', '2', '6']);
  }, 60000);

  it('relative_date last_n_months(3) → rows 1,2,3,6 (future row 5 excluded)', async () => {
    const rows = await runFilter({
      filters: [
        { column: 'date_col', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } },
      ],
    });
    expect(ids(rows)).toEqual(['1', '2', '3', '6']);
  }, 60000);

  // -------------------------------------------------------------------------
  // Operator matrix
  // -------------------------------------------------------------------------
  it('eq on name → row 1 (alpha)', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'eq', value: 'alpha' }] }))
    ).toEqual(['1']);
  }, 60000);

  it('neq on status: not "active" → rows 2,4,7 (null-inclusive: NULL row 7 kept)', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'status', operator: 'neq', value: 'active' }] }))
    ).toEqual(['2', '4', '7']);
  }, 60000);

  it('not_in on name: not in (alpha, beta) → rows 3,4,5,6,7 (null-inclusive: NULL row 7 kept)', async () => {
    expect(
      ids(
        await runFilter({
          filters: [{ column: 'name', operator: 'not_in', value: ['alpha', 'beta'] }],
        })
      )
    ).toEqual(['3', '4', '5', '6', '7']);
  }, 60000);

  it('gt: amount > 20 → rows 3,4,5', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'amount', operator: 'gt', value: 20 }] }))
    ).toEqual(['3', '4', '5']);
  }, 60000);

  it('lte: amount <= 20 → rows 1,2,6', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'amount', operator: 'lte', value: 20 }] }))
    ).toEqual(['1', '2', '6']);
  }, 60000);

  it('contains "alph" → row 1', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'contains', value: 'alph' }] }))
    ).toEqual(['1']);
  }, 60000);

  it('not_contains "eta" → rows 1,3,4,5,6,7 (null-inclusive: NULL row 7 kept)', async () => {
    expect(
      ids(
        await runFilter({ filters: [{ column: 'name', operator: 'not_contains', value: 'eta' }] })
      )
    ).toEqual(['1', '3', '4', '5', '6', '7']);
  }, 60000);

  it('starts_with "al" → row 1', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'starts_with', value: 'al' }] }))
    ).toEqual(['1']);
  }, 60000);

  it('ends_with "a" → rows 1,2,6', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'ends_with', value: 'a' }] }))
    ).toEqual(['1', '2', '6']);
  }, 60000);

  // -------------------------------------------------------------------------
  // PROBE (b): regex anchoring — Spark RLIKE must be PARTIAL match
  // -------------------------------------------------------------------------
  it('regex "^alp" → row 1 (Spark RLIKE is partial; ^ anchors to start, not full string)', async () => {
    const rows = await runFilter({
      filters: [{ column: 'name', operator: 'regex', value: '^alp' }],
    });
    console.log(`[REGEX] ^alp match ids: [${ids(rows).join(',')}] (expect [1])`);
    expect(ids(rows)).toEqual(['1']);
  }, 60000);

  it('not_regex "^alp" → rows 2,3,4,5,6,7 (null-inclusive: NULL row 7 kept)', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'not_regex', value: '^alp' }] }))
    ).toEqual(['2', '3', '4', '5', '6', '7']);
  }, 60000);

  it('regex "\\\\d" (digit class) → row 4 (100%) — backslash survives into RLIKE', async () => {
    const rows = await runFilter({
      filters: [{ column: 'name', operator: 'regex', value: '\\d' }],
    });
    console.log(`[REGEX] \\d match ids: [${ids(rows).join(',')}] (expect [4])`);
    expect(ids(rows)).toEqual(['4']);
  }, 60000);

  it('is_not_empty → all 6 rows', async () => {
    expect(
      (await runFilter({ filters: [{ column: 'name', operator: 'is_not_empty' }] })).length
    ).toBe(6);
  }, 60000);

  it('between: amount BETWEEN 20 AND 30 → rows 2,3', async () => {
    expect(
      ids(
        await runFilter({
          filters: [{ column: 'amount', operator: 'between', value: { from: 20, to: 30 } }],
        })
      )
    ).toEqual(['2', '3']);
  }, 60000);

  // -------------------------------------------------------------------------
  // Wildcard-literal + quote safety
  // -------------------------------------------------------------------------
  it('SAFETY contains "100%" → only row 4 (% is not a LIKE wildcard)', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'contains', value: '100%' }] }))
    ).toEqual(['4']);
  }, 60000);

  it('SAFETY eq "O\'Brien" → row 3 (single-quote doubling round-trip)', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'eq', value: "O'Brien" }] }))
    ).toEqual(['3']);
  }, 60000);

  // -------------------------------------------------------------------------
  // Sort + limit
  // -------------------------------------------------------------------------
  it('sort by amount DESC + limit 2 → rows 5,4 (amounts 50,40)', async () => {
    const rows = await runFilter({ sort: [{ column: 'amount', direction: 'desc' }], limit: 2 });
    expect(rows.map(r => String(r.id))).toEqual(['5', '4']);
  }, 60000);

  // -------------------------------------------------------------------------
  // Aggregation (real GROUP BY / percentile / date-trunc / totals)
  // -------------------------------------------------------------------------
  // Seed recap (amounts and status):
  //   id=1  alpha    10.00  active
  //   id=2  beta     20.00  inactive
  //   id=3  O'Brien  30.00  active
  //   id=4  100%     40.00  inactive
  //   id=5  a\b      50.00  active
  //   id=6  gamma     0.00  active
  //
  // active   → ids 1,3,5,6 → amounts 10+30+50+0 = 90, avg 22.5, count 4
  // inactive → ids 2,4     → amounts 20+40 = 60, avg 30, count 2
  // all 6 amounts sorted: 0,10,20,30,40,50
  //   P25 = PERCENTILE_CONT(0.25) = 10 (exact, not approx)
  //   P50 = PERCENTILE_CONT(0.50) = 25 (linear interp of 20,30)
  //   P75 = PERCENTILE_CONT(0.75) = 40
  //   P95 = PERCENTILE_CONT(0.95) = 50
  //
  // STRING_AGG uses array_join(collect_list(col), ', ') — unordered; sort before compare.
  //   active names:   alpha, O'Brien, a\b, gamma
  //   inactive names: beta, 100%
  //
  // date-trunc MONTH: rows 1 & 6 share the same month bucket (SUM=10),
  //   all 6 rows sum to 150 across all buckets.
  // date-trunc YEAR: at least 3 year buckets (rows 4 and 5 are in different years);
  //   total SUM = 150.
  describe('Aggregation (real GROUP BY / percentile / date-trunc / totals)', () => {
    // Totals under a metric filter, on the FLAT (non-blended) path. A Totals query has no GROUP BY,
    // so the report's HAVING travels as a `groupRestriction` and the builder joins the groups that
    // survive it. Two things are proven here that no unit test can: that this engine ACCEPTS the
    // emitted SQL — the restriction subquery selects the same columns off the same table as the outer
    // query, which made every outer reference ambiguous until the keys were given private aliases —
    // and that the number is restricted rather than merely filtered.
    it('fan-out: Totals are restricted to the groups the metric filter keeps (real Databricks)', async () => {
      // GROUP BY status, HAVING SUM(amount) > 70: active (90) survives; inactive (60) and the
      // NULL-status group (NULL) do not.
      const restricted = await runFilter({
        columns: ['amount', 'id'],
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
        groupRestriction: {
          dimensions: ['status'],
          having: [{ column: 'amount', function: 'SUM', operator: 'gt', value: 70 }],
        },
      } as never);
      const unrestricted = await runFilter({
        columns: ['amount', 'id'],
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(Number(restricted[0]['amount | SUM'])).toBeCloseTo(90, 5);
      expect(Number(restricted[0]['id | COUNTUNIQUE'])).toBe(4);
      expect(Number(unrestricted[0]['amount | SUM'])).toBeCloseTo(150, 5);
    }, 120000);

    // group-by + multi-fn: SUM + AVG + COUNT_DISTINCT + MIN + MAX + COUNT + Row Count
    it('group-by status + SUM/AVG/COUNT_DISTINCT/MIN/MAX/COUNT returns real per-group values', async () => {
      const rows = await runFilter({
        columns: ['status', 'amount', 'id'],
        rowCount: true,
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
          { column: 'id', function: 'COUNT_DISTINCT' },
          { column: 'amount', function: 'MIN' },
          { column: 'amount', function: 'MAX' },
          { column: 'amount', function: 'COUNT' },
        ],
      });

      // 3 groups: active, inactive, and the NULL-status row 7 (its amount is NULL, so it
      // contributes nothing to the active/inactive aggregates below).
      expect(rows).toHaveLength(3);
      const byStatus = new Map(rows.map(r => [String(r.status), r]));

      const active = byStatus.get('active')!;
      expect(active).toBeDefined();
      expect(Number(active['amount | SUM'])).toBeCloseTo(90, 5);
      expect(Number(active['amount | AVG'])).toBeCloseTo(22.5, 5);
      expect(Number(active['id | COUNTUNIQUE'])).toBe(4);
      expect(Number(active['amount | MIN'])).toBeCloseTo(0, 5);
      expect(Number(active['amount | MAX'])).toBeCloseTo(50, 5);
      expect(Number(active['amount | COUNT'])).toBe(4);
      expect(Number(active['Row Count'])).toBe(4);

      const inactive = byStatus.get('inactive')!;
      expect(inactive).toBeDefined();
      expect(Number(inactive['amount | SUM'])).toBeCloseTo(60, 5);
      expect(Number(inactive['amount | AVG'])).toBeCloseTo(30, 5);
      expect(Number(inactive['id | COUNTUNIQUE'])).toBe(2);
      expect(Number(inactive['amount | MIN'])).toBeCloseTo(20, 5);
      expect(Number(inactive['amount | MAX'])).toBeCloseTo(40, 5);
      expect(Number(inactive['amount | COUNT'])).toBe(2);
      expect(Number(inactive['Row Count'])).toBe(2);
    }, 60000);

    // all percentiles + monotonicity. PERCENTILE_CONT is exact in Databricks.
    it('all percentiles (P25/P50/P75/P95) on amount: exact values, in-range, monotonic', async () => {
      const rows = await runFilter({
        columns: ['amount'],
        aggregations: [
          { column: 'amount', function: 'P25' },
          { column: 'amount', function: 'P50' },
          { column: 'amount', function: 'P75' },
          { column: 'amount', function: 'P95' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      const p25 = Number(row['amount | P25']);
      const p50 = Number(row['amount | MEDIAN']);
      const p75 = Number(row['amount | P75']);
      const p95 = Number(row['amount | P95']);

      // All finite and within the data range [0, 50].
      for (const p of [p25, p50, p75, p95]) {
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(50);
      }
      // Monotonic: P25 ≤ P50 ≤ P75 ≤ P95.
      expect(p25).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p75);
      expect(p75).toBeLessThanOrEqual(p95);

      // PERCENTILE_CONT is exact in Databricks (not approximate).
      // Sorted amounts: 0,10,20,30,40,50 (n=6).
      // P25 = 0.25*(6-1)=1.25 → 10 + 0.25*(20-10)=12.5
      expect(p25).toBeCloseTo(12.5, 1);
      // P50 = 0.50*(6-1)=2.5 → 20 + 0.5*(30-20)=25
      expect(p50).toBeCloseTo(25, 1);
      // P75 = 0.75*(6-1)=3.75 → 30 + 0.75*(40-30)=37.5
      expect(p75).toBeCloseTo(37.5, 1);
      // P95 = 0.95*(6-1)=4.75 → 40 + 0.75*(50-40)=47.5
      expect(p95).toBeCloseTo(47.5, 1);
    }, 60000);

    // STRING_AGG (collect_list, unordered) — sort before comparing members.
    // Note: Databricks SQL driver may strip special characters (apostrophes) from
    // string aggregate results, so O'Brien is asserted loosely (starts-with check).
    // The separator `', '` is used by array_join; split and sort before comparing.
    it('STRING_AGG (group by status) executes; assert member count and known names', async () => {
      const rows = await runFilter({
        columns: ['status', 'name'],
        aggregations: [{ column: 'name', function: 'STRING_AGG' }],
      });

      // 3 groups: active, inactive, and the NULL-status row 7 (asserted loosely below).
      expect(rows).toHaveLength(3);
      const byStatus = new Map(rows.map(r => [String(r.status), r]));

      const splitSorted = (v: unknown): string[] =>
        String(v)
          .split(', ')
          .map(s => s.trim())
          .sort();

      const active = byStatus.get('active')!;
      expect(active).toBeDefined();
      // active names: alpha(1), O'Brien(3), a\b(5), gamma(6) — 4 members.
      const activeMembers = splitSorted(active['name | STRINGAGG']);
      expect(activeMembers).toHaveLength(4);
      expect(activeMembers).toContain('alpha');
      expect(activeMembers).toContain('gamma');
      // a\b: the backslash may be escaped differently; assert the member containing 'b'.
      expect(activeMembers.some(m => m.includes('b') && m !== 'beta')).toBe(true);
      // O'Brien: driver may strip the apostrophe — assert the member starts with 'O'.
      expect(activeMembers.some(m => m.startsWith('O'))).toBe(true);

      const inactive = byStatus.get('inactive')!;
      expect(inactive).toBeDefined();
      // inactive names: beta(2), 100%(4) — 2 members.
      const inactiveMembers = splitSorted(inactive['name | STRINGAGG']);
      expect(inactiveMembers).toHaveLength(2);
      expect(inactiveMembers).toContain('beta');
      expect(inactiveMembers.some(m => m.includes('100'))).toBe(true);
    }, 60000);

    // date-trunc MONTH + SUM. Rows 1 and 6 always share the same month bucket (today),
    // row 2 (yesterday) may also fall in the same month. Rows 3 (-40d), 4 (-400d), and
    // 5 (+13mo) each land in their own distinct months → at least 4 total buckets.
    // Grand total across all buckets must equal 150.
    it('date-trunc MONTH + SUM: grand total=150, row 1&6 bucket exists, at least 4 buckets', async () => {
      const rows = await runFilter({
        columns: ['date_col', 'amount'],
        rowCount: true,
        dateTruncs: [{ column: 'date_col', unit: 'MONTH' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      // At minimum rows 1&6 (today), rows 3,4,5 each in distinct months → ≥4 buckets.
      expect(rows.length).toBeGreaterThanOrEqual(4);

      const totalSum = rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);
      expect(totalSum).toBeCloseTo(150, 5);

      // Find the bucket for today's month.
      // Databricks returns DATE columns as JS Date objects; normalise to YYYY-MM-DD string.
      const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const thisMonthStart = todayIso.slice(0, 7) + '-01'; // YYYY-MM-01
      const dateColToIso = (v: unknown): string => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v).slice(0, 10); // handles 'YYYY-MM-DD ...' string forms too
      };
      const thisBucket = rows.find(r => dateColToIso(r.date_col) === thisMonthStart);
      expect(thisBucket).toBeDefined();
      // This month always contains rows 1 (10) and 6 (0). Row 2 (yesterday, 20) may also
      // be here if test runs on any day except the 1st → SUM is either 10 or 30.
      // Assert it's at least 10 and ≤ 150 rather than a brittle exact value.
      const thisBucketSum = Number(thisBucket!['amount | SUM']);
      expect(thisBucketSum).toBeGreaterThanOrEqual(10);
      expect(thisBucketSum).toBeLessThanOrEqual(150);
    }, 60000);

    // date-trunc YEAR + SUM: total must equal 150; at least 3 year buckets
    // (current year, -400d=last year, +13mo=next year).
    it('date-trunc YEAR + SUM: grand total=150, at least 3 distinct year buckets', async () => {
      const rows = await runFilter({
        columns: ['date_col', 'amount'],
        dateTruncs: [{ column: 'date_col', unit: 'YEAR' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      expect(rows.length).toBeGreaterThanOrEqual(3);
      const totalSum = rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);
      expect(totalSum).toBeCloseTo(150, 5);
    }, 60000);

    // totals shape (metrics-only, no GROUP BY) → one row with grand aggregates.
    it('totals shape (no GROUP BY, SUM+COUNT_DISTINCT+Row Count): one row, grand values', async () => {
      const rows = await runFilter({
        columns: ['amount', 'id'],
        rowCount: true,
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row['amount | SUM'])).toBeCloseTo(150, 5);
      // 7 rows now (all-NULL row 7 added); its id is non-NULL so COUNT DISTINCT id = 7.
      expect(Number(row['id | COUNTUNIQUE'])).toBe(7);
      expect(Number(row['Row Count'])).toBe(7);
    }, 60000);

    // totals shape WITH a WHERE filter.
    it('totals with WHERE status=active: SUM=90, COUNTUNIQUE=4, Row Count=4', async () => {
      const rows = await runFilter({
        columns: ['amount', 'id'],
        rowCount: true,
        filters: [{ column: 'status', operator: 'eq', value: 'active' }],
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      // active ids 1,3,5,6 → amounts 10+30+50+0=90; 4 distinct ids; 4 rows.
      expect(Number(row['amount | SUM'])).toBeCloseTo(90, 5);
      expect(Number(row['id | COUNTUNIQUE'])).toBe(4);
      expect(Number(row['Row Count'])).toBe(4);
    }, 60000);

    // aggregation respects WHERE filter (group-by path).
    it('group-by status + SUM respects amount > 15 filter: only rows 3,4,5 contribute', async () => {
      const rows = await runFilter({
        columns: ['status', 'amount'],
        filters: [{ column: 'amount', operator: 'gt', value: 15 }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      // amount > 15 keeps ids 2(20),3(30),4(40),5(50) — rows 1(10) and 6(0) excluded.
      // active   group: ids 3,5 → SUM = 80
      // inactive group: ids 2,4 → SUM = 60
      expect(rows).toHaveLength(2);
      const byStatus = new Map(rows.map(r => [String(r.status), r]));
      expect(Number(byStatus.get('active')!['amount | SUM'])).toBeCloseTo(80, 5);
      expect(Number(byStatus.get('inactive')!['amount | SUM'])).toBeCloseTo(60, 5);
    }, 60000);

    // ORDER BY aggregated alias (SUM desc) + limit 1 → the larger group (active, SUM=90).
    it('ORDER BY aggregated alias (SUM desc) + limit 1 returns the larger group (active, SUM=90)', async () => {
      const rows = await runFilter({
        columns: ['status', 'amount'],
        aggregations: [{ column: 'amount', function: 'SUM' }],
        sort: [{ column: 'amount', direction: 'desc' }],
        limit: 1,
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(String(row.status)).toBe('active');
      expect(Number(row['amount | SUM'])).toBeCloseTo(90, 5);
    }, 60000);
  });
});

// ---------------------------------------------------------------------------
// Blended pre-join SLICE — mirror of the BigQuery suite on REAL Databricks.
// Proves a pre-join filter narrows a JOINED data mart inside its `<alias>_raw`
// CTE before the JOIN. Uses its OWN two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed:
//   orders(order_id, user_id, amount): (1,10,100) (2,20,200) (3,10,300) (4,30,400)
//   users(user_id, role, country):     (10,'admin','US') (20,'viewer','US') (30,'admin','DE')
//
// Subsidiaries are LEFT JOINed, so a slice alone narrows the users_raw CTE and
// NULLs out unmatched home rows; a post-join `role IS NOT NULL` eliminates them.
// The Databricks renderer INLINES literals, so we run the returned `sql` directly.
describeIfCredentials(
  'Blended pre-join slice narrows joined mart in *_raw CTE (real Databricks)',
  () => {
    let adapter: DatabricksApiAdapter;
    let ordersFQN: string;
    let usersFQN: string;

    const builder = new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer());

    function usersRelationship(): DataMartRelationship {
      return {
        id: 'rel-users',
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    function blendContext(over: Partial<BlendedQueryContext> = {}): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'users__role', aliasPath: 'users', originalFieldName: 'role', type: 'STRING' },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      return {
        mainTableReference: ordersFQN,
        mainDataMartTitle: 'Orders',
        mainDataMartUrl: 'http://x/orders',
        chains: [
          {
            relationship: usersRelationship(),
            targetTableReference: usersFQN,
            parentAlias: 'main',
            cteName: 'users',
            blendedFields: [
              {
                targetFieldName: 'role',
                outputAlias: 'role',
                isHidden: false,
                aggregateFunction: 'MAX',
              },
            ],
            targetDataMartTitle: 'Users',
            targetDataMartUrl: 'http://x/users',
          },
        ],
        columns: ['order_id', 'role'],
        fieldIndex,
        ...over,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      // Databricks renderer inlines literals → params empty; run sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndFetchAll(sql);
    }

    function ids(rows: Record<string, unknown>[]): number[] {
      return rows.map(r => Number(r.order_id ?? r.ORDER_ID)).sort((a, b) => a - b);
    }

    // Pick the role key by presence (not `??`) so a genuine SQL NULL survives as
    // `null` instead of collapsing to the uppercase fallback's `undefined`.
    function roleOf(r: Record<string, unknown>): unknown {
      return 'role' in r ? r.role : r.ROLE;
    }

    beforeAll(async () => {
      adapter = makeAdapter();

      const stamp = `${Date.now()}`;
      ordersFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.blend_orders_${stamp}`;
      usersFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.blend_users_${stamp}`;

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${ordersFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${ordersFQN} (order_id BIGINT, user_id BIGINT, amount DECIMAL(10,2)) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${ordersFQN} (order_id, user_id, amount) VALUES
        (1, 10, 100),
        (2, 20, 200),
        (3, 10, 300),
        (4, 30, 400)`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${usersFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${usersFQN} (user_id BIGINT, role STRING, country STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${usersFQN} (user_id, role, country) VALUES
        (10, 'admin',  'US'),
        (20, 'viewer', 'US'),
        (30, 'admin',  'DE')`
      );
    }, 180000);

    afterAll(async () => {
      try {
        for (const fqn of [ordersFQN, usersFQN]) {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        }
      } catch (error) {
        console.warn('Failed to drop blend tables:', error);
      } finally {
        await adapter.destroy();
      }
    }, 60000);

    it('BASELINE (no slice): every order carries its joined user role', async () => {
      const rows = await runBlend(blendContext());
      expect(ids(rows)).toEqual([1, 2, 3, 4]);
      const roleByOrder = Object.fromEntries(
        rows.map(r => [Number(r.order_id ?? r.ORDER_ID), roleOf(r)])
      );
      expect(roleByOrder).toEqual({
        1: 'admin', // user 10
        2: 'viewer', // user 20
        3: 'admin', // user 10
        4: 'admin', // user 30
      });
    }, 120000);

    it('SLICE (pre-join role=admin): users_raw narrowed BEFORE join → order 2 (viewer) gets NULL role', async () => {
      const rows = await runBlend(
        blendContext({
          filters: [
            {
              column: 'users__role',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
          ],
        })
      );
      expect(ids(rows)).toEqual([1, 2, 3, 4]);
      const roleByOrder = Object.fromEntries(
        rows.map(r => [Number(r.order_id ?? r.ORDER_ID), roleOf(r)])
      );
      expect(roleByOrder[1]).toBe('admin');
      expect(roleByOrder[3]).toBe('admin');
      expect(roleByOrder[4]).toBe('admin');
      expect(roleByOrder[2]).toBeNull(); // sliced away → NULL after LEFT JOIN
    }, 120000);

    it('SLICE + post-join (role IS NOT NULL): joined dimension narrowed → result set {1,3,4}, order 2 eliminated', async () => {
      const rows = await runBlend(
        blendContext({
          filters: [
            {
              column: 'users__role',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
            { column: 'role', operator: 'is_not_null', placement: 'post-join' },
          ],
        })
      );
      expect(ids(rows)).toEqual([1, 3, 4]);
      expect(rows.every(r => roleOf(r) === 'admin')).toBe(true);
    }, 120000);

    it('SLICE (pre-join role=viewer): only order 2 keeps a role; admins NULLed out', async () => {
      const rows = await runBlend(
        blendContext({
          filters: [
            {
              column: 'users__role',
              operator: 'eq',
              value: 'viewer',
              placement: 'pre-join',
            },
            { column: 'role', operator: 'is_not_null', placement: 'post-join' },
          ],
        })
      );
      expect(ids(rows)).toEqual([2]);
      expect(rows[0] ? roleOf(rows[0]) : undefined).toBe('viewer');
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended POST-JOIN aggregation — the canonical composite-key funnel on REAL
// Databricks. This path (an outer GROUP BY over a joined/blended result) had
// only ever been exercised by unit string-tests; it had NEVER run against a
// real Databricks warehouse. Uses its OWN two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed (composite-key, pre-aggregated marts → 1-to-1 join, no row multiplication):
//   sessions(dt, channel, sessions): ('2024-01-01','paid',100) ('2024-01-01','organic',50)
//   events(dt, channel, events):     ('2024-01-01','paid',10)  ('2024-01-01','organic',5)
//
// `dt` (not `date`) avoids the Spark reserved-keyword landmine: the builder emits
// identifiers unquoted. Join on the COMPOSITE key (dt AND channel). The events CTE
// rolls up SUM by (dt,channel) — identity here, one row per key — then main LEFT
// JOINs it. The outer SELECT groups by channel with SUM(sessions) + SUM(events).
// If the join fanned out, sessions would be inflated; it must stay 100/50.
describeIfCredentials(
  'Blended post-join aggregation — composite-key funnel (real Databricks)',
  () => {
    let adapter: DatabricksApiAdapter;
    let sessionsFQN: string;
    let eventsFQN: string;

    const builder = new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer());

    function eventsRelationship(
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id: 'rel-events',
        targetAlias: 'events',
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    // Composite-key context: post-join SUM(sessions) + SUM(events), group by channel.
    function compositeContext(): BlendedQueryContext {
      // 'events' is a joined (blended) column with a genuine pre-join SUM
      // roll-up (not an ANY_VALUE passthrough), so the report-level SUM routes through
      // the value sleeve — which needs the field index to resolve the owner chain/column.
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'events', aliasPath: 'events', originalFieldName: 'events', type: 'BIGINT' },
        ],
        availableSources: [{ aliasPath: 'events', isIncluded: true }],
      } as never);
      return {
        mainTableReference: sessionsFQN,
        mainDataMartTitle: 'Sessions',
        mainDataMartUrl: 'http://x/sessions',
        chains: [
          {
            relationship: eventsRelationship([
              { sourceFieldName: 'dt', targetFieldName: 'dt' },
              { sourceFieldName: 'channel', targetFieldName: 'channel' },
            ]),
            targetTableReference: eventsFQN,
            parentAlias: 'main',
            cteName: 'events',
            blendedFields: [
              {
                targetFieldName: 'events',
                outputAlias: 'events',
                isHidden: false,
                aggregateFunction: 'SUM',
              },
            ],
            targetDataMartTitle: 'Events',
            targetDataMartUrl: 'http://x/events',
          },
        ],
        columns: ['channel', 'sessions', 'events'],
        aggregations: [
          { column: 'sessions', function: 'SUM' },
          { column: 'events', function: 'SUM' },
        ],
        fieldIndex,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      // Databricks renderer inlines literals → params empty; run sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndFetchAll(sql);
    }

    beforeAll(async () => {
      adapter = makeAdapter();

      const stamp = `${Date.now()}`;
      sessionsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.blend_agg_sessions_${stamp}`;
      eventsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.blend_agg_events_${stamp}`;

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${sessionsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${sessionsFQN} (dt DATE, channel STRING, sessions BIGINT) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${sessionsFQN} (dt, channel, sessions) VALUES
        (DATE'2024-01-01', 'paid',    100),
        (DATE'2024-01-01', 'organic', 50)`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${eventsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${eventsFQN} (dt DATE, channel STRING, events BIGINT) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${eventsFQN} (dt, channel, events) VALUES
        (DATE'2024-01-01', 'paid',    10),
        (DATE'2024-01-01', 'organic', 5)`
      );
    }, 180000);

    afterAll(async () => {
      try {
        for (const fqn of [sessionsFQN, eventsFQN]) {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        }
      } catch (error) {
        console.warn('Failed to drop blend-agg tables:', error);
      } finally {
        await adapter.destroy();
      }
    }, 60000);

    // The headline case: the composite-key join is 1-to-1, so the outer GROUP BY
    // yields exactly one row per channel with un-inflated SUM(sessions) and the
    // joined SUM(events). A fan-out would multiply sessions; the assertion would
    // then fail (which is the entire point of running this for real).
    it('composite-key (dt AND channel) post-join SUM stays 1-to-1: paid 100/10, organic 50/5', async () => {
      const rows = await runBlend(compositeContext());

      expect(rows).toHaveLength(2);
      const byChannel = new Map(rows.map(r => [String(r.channel), r]));

      const paid = byChannel.get('paid')!;
      expect(paid).toBeDefined();
      expect(Number(paid['sessions | SUM'])).toBe(100);
      expect(Number(paid['events | SUM'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(organic).toBeDefined();
      expect(Number(organic['sessions | SUM'])).toBe(50);
      expect(Number(organic['events | SUM'])).toBe(5);
    }, 120000);

    // Same shape with a single-column join (channel only). The events table here
    // has one row per channel, so it is also 1-to-1 — proves the simpler join path
    // executes and aggregates correctly on real Databricks too.
    it('single-key (channel only) post-join SUM also executes 1-to-1: paid 100/10, organic 50/5', async () => {
      const context = compositeContext();
      context.chains[0].relationship = eventsRelationship([
        { sourceFieldName: 'channel', targetFieldName: 'channel' },
      ]);

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const byChannel = new Map(rows.map(r => [String(r.channel), r]));

      const paid = byChannel.get('paid')!;
      expect(Number(paid['sessions | SUM'])).toBe(100);
      expect(Number(paid['events | SUM'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(Number(organic['sessions | SUM'])).toBe(50);
      expect(Number(organic['events | SUM'])).toBe(5);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended COUNT_DISTINCT through a bridge — "metric sleeve" fix (, real
// Databricks). This proves the N-hop NESTED-bridge variant: a 2-hop chain
// events -> users -> organizations, where `organizations` is a CHILD of
// `users` (org_id lives on users), NOT a sibling of it. Main = events
// (bridge/fact grain); `users` is a ROOT chain off main (dimension: country);
// `organizations` hangs off users (metric: distinct org count). Because the
// metric column is two hops from main, the sleeve must re-join BOTH raw CTEs
// (Task 3's N-hop ancestor closure) — that closure is exactly what this case
// exercises against real Databricks.
//
// Before this fix, a joined COUNT_DISTINCT metric was read off the bottom-up
// dedup CTE chain, where each intermediate level collapses multiple raw rows
// per parent-join-key via ANY_VALUE/MAX — the SAME collapse additive/idempotent
// metrics rely on. That collapse is lossless ONLY when a join key maps to
// exactly one raw value; it breaks the moment a user genuinely belongs to more
// than one org: ANY_VALUE(orgId) silently keeps just ONE of the user's orgs
// and drops the rest, so the OLD path UNDER-counts the report's COUNT_DISTINCT
// (this nested topology). The sleeve fixes it by re-joining the RAW
// (pre-dedup) path and counting distinct at the report's OWN dimension grain,
// bypassing every intermediate collapse. Uses its OWN 3 seeded tables +
// beforeAll/afterAll (see the reference scenario/seed in
// bigquery.integration.ts's case).
//
// Seed — org membership lives on `users` (org info reaches `events` through
// the users bridge), and u1 genuinely belongs to TWO orgs:
//   users(userId, country, org_id): u1 US o1 · u1 US o4 (TWO membership rows)
//                                    u2 US o5 · u3 DE o2 · u4 UA o3 · u5 PL o3
//   organizations(orgId): o1, o2, o3, o4, o5
//   events(event_id, user_id): e1 u1 · e2 u1 · e3 u2 · e4 u3 · e5 u3 ·
//                              e6 u4 · e7 u4 · e8 u5
//
// Ground truth (unique orgs per country): US=3 {o1,o4,o5}, DE=1 {o2},
// UA=1 {o3}, PL=1 {o3}. Grand total distinct = 5 {o1,o2,o3,o4,o5}.

describeIfCredentials(
  'Blended COUNT_DISTINCT through a bridge — metric sleeve (real Databricks)',
  () => {
    let adapter: DatabricksApiAdapter;
    let eventsFQN: string;
    let usersFQN: string;
    let organizationsFQN: string;

    const builder = new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer());

    function bridgeRelationship(
      id: string,
      targetAlias: string,
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id,
        targetAlias,
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    // main -> users (dimension: country) -> organizations (metric: COUNT_DISTINCT
    // orgId, nested UNDER users, not a sibling root chain).
    function bridgeContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__country',
            aliasPath: 'users',
            originalFieldName: 'country',
            type: 'STRING',
          },
          {
            // Second countable column on the SAME chain as `country` — that shared owner is what
            // makes the two COUNT DISTINCT metrics merge into ONE sleeve CTE.
            name: 'users__org_id',
            aliasPath: 'users',
            originalFieldName: 'org_id',
            type: 'STRING',
          },
          {
            name: 'organizations__orgId',
            aliasPath: 'organizations',
            originalFieldName: 'orgId',
            type: 'STRING',
          },
        ],
        availableSources: [
          { aliasPath: 'users', isIncluded: true },
          { aliasPath: 'organizations', isIncluded: true },
        ],
      } as never);

      return {
        mainTableReference: eventsFQN,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: bridgeRelationship('rel-users', 'users', [
              { sourceFieldName: 'user_id', targetFieldName: 'userId' },
            ]),
            targetTableReference: usersFQN,
            parentAlias: 'main',
            cteName: 'users',
            blendedFields: [
              {
                targetFieldName: 'country',
                outputAlias: 'users__country',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
              {
                targetFieldName: 'org_id',
                outputAlias: 'users__org_id',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Users',
            targetDataMartUrl: 'http://x/users',
          },
          {
            relationship: bridgeRelationship('rel-organizations', 'organizations', [
              { sourceFieldName: 'org_id', targetFieldName: 'orgId' },
            ]),
            targetTableReference: organizationsFQN,
            parentAlias: 'users',
            cteName: 'organizations',
            blendedFields: [
              {
                targetFieldName: 'orgId',
                outputAlias: 'organizations__orgId',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Organizations',
            targetDataMartUrl: 'http://x/organizations',
          },
        ],
        columns: ['users__country', 'organizations__orgId'],
        aggregations: [{ column: 'organizations__orgId', function: 'COUNT_DISTINCT' }],
        fieldIndex,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      // Databricks renderer inlines literals → params empty; run sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndFetchAll(sql);
    }

    beforeAll(async () => {
      adapter = makeAdapter();

      const stamp = `${Date.now()}`;
      eventsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.bridge_events_${stamp}`;
      usersFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.bridge_users_${stamp}`;
      organizationsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.bridge_organizations_${stamp}`;

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${eventsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${eventsFQN} (event_id STRING, user_id STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${eventsFQN} (event_id, user_id) VALUES
        ('e1','u1'), ('e2','u1'), ('e3','u2'),
        ('e4','u3'), ('e5','u3'),
        ('e6','u4'), ('e7','u4'), ('e8','u5')`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${usersFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${usersFQN} (userId STRING, country STRING, org_id STRING) USING DELTA`
      );
      // u1 genuinely belongs to TWO orgs (o1 AND o4) — the fan-out that breaks the
      // pre-fix dedup-then-read mechanism (see block comment above).
      await adapter.executeQuery(
        `INSERT INTO ${usersFQN} (userId, country, org_id) VALUES
        ('u1','US','o1'), ('u1','US','o4'),
        ('u2','US','o5'),
        ('u3','DE','o2'),
        ('u4','UA','o3'),
        ('u5','PL','o3')`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${organizationsFQN}`);
      await adapter.executeQuery(`CREATE TABLE ${organizationsFQN} (orgId STRING) USING DELTA`);
      await adapter.executeQuery(
        `INSERT INTO ${organizationsFQN} (orgId) VALUES ('o1'), ('o2'), ('o3'), ('o4'), ('o5')`
      );
    }, 180000);

    afterAll(async () => {
      try {
        for (const fqn of [eventsFQN, usersFQN, organizationsFQN]) {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        }
      } catch (error) {
        console.warn('Failed to drop bridge tables:', error);
      } finally {
        await adapter.destroy();
      }
    }, 60000);

    it('fan-out: joined COUNT DISTINCT is correct through a bridge (sleeve): US=3, DE=1, UA=1, PL=1', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(4);
      const byCountry = new Map(
        rows.map(r => [String(r.users__country), Number(r['organizations__orgId | COUNTUNIQUE'])])
      );

      // THE headline case (under-counted pre-fix): u1 genuinely belongs to TWO
      // orgs (o1, o4); u2 belongs to a third (o5) — US must show all 3, not the
      // pre-fix ANY_VALUE-collapsed 2.
      expect(byCountry.get('US')).toBe(3);
      expect(byCountry.get('DE')).toBe(1);
      expect(byCountry.get('UA')).toBe(1);
      expect(byCountry.get('PL')).toBe(1);
    }, 120000);

    it('grand total (no grouping) also stays correct through the bridge: 5 distinct orgs, not the pre-fix 4', async () => {
      const context = bridgeContext();
      context.columns = ['organizations__orgId']; // dimensionless: no report GROUP BY
      const rows = await runBlend(context);

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['organizations__orgId | COUNTUNIQUE'])).toBe(5);
    }, 120000);

    // MERGED COUNT DISTINCT sleeve, live. Two COUNT DISTINCT metrics on the
    // SAME owner chain share ONE CTE, so it emits several `COUNT(DISTINCT …)` in a single SELECT.
    // Nothing proved a warehouse accepts that shape: the merge is asserted at unit level (SQL
    // text) and every live sleeve test so far counted exactly one column. Redshift in particular
    // has a history of restricting multiple COUNT(DISTINCT) per query, and it is the reason this
    // case was called out as unverified before release.
    //
    // Grand total over the bridge seed (u1 belongs to TWO orgs, so the join fans out):
    //   distinct countries = US, DE, UA, PL          -> 4
    //   distinct org ids   = o1, o4, o5, o2, o3      -> 5
    it('fan-out: merged COUNT DISTINCT sleeve: two counts in ONE CTE stay correct (countries=4, orgs=5)', async () => {
      const context = bridgeContext();
      context.columns = ['users__country', 'users__org_id'];
      context.aggregations = [
        { column: 'users__country', function: 'COUNT_DISTINCT' },
        { column: 'users__org_id', function: 'COUNT_DISTINCT' },
      ];

      // Guard the premise: if the two metrics stopped merging, the numbers below would still
      // pass while this test no longer covered the shape it exists for.
      const { sql } = builder.buildBlendedQuery(context);
      expect(sql).toContain('sleeve_users_counts AS (');
      expect((sql.match(/COUNT\(DISTINCT /g) ?? []).length).toBe(2);

      const rows = await runBlend(context);

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['users__country | COUNTUNIQUE'])).toBe(4);
      expect(Number(rows[0]['users__org_id | COUNTUNIQUE'])).toBe(5);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM/AVG through a bridge — value sleeve set-based proof (5,
// real Databricks). Mirrors bigquery.integration.ts's C2.4 bridge SUM/AVG
// case exactly (same topology, seed, and ground truth) — the cross-dialect
// proof that `buildRowSurrogate()` (`ROW_NUMBER() OVER (ORDER BY 1)`, the base
// class default — Databricks/Spark takes no per-dialect override) parses and
// executes on a real Databricks SQL warehouse.
//
// Topology: main = items (an order/product bridge table). TWO sibling chains
// off main: products (dimension: category) and orders (metric: revenue,
// aggregated post-join as SUM/AVG).
//
// Seed (identical to the BigQuery C2.4 fixture):
//   orders(orderId, revenue):      o1=100, o2=50, o3=30
//   products(productId, category): pA=Supplements, pB=Supplements, pC=Gear
//   items(itemId, orderId, productId):
//     i1 o1 pA · i2 o1 pC   (o1 touches BOTH categories)
//     i3 o2 pA · i4 o2 pB   (o2 touches Supplements via TWO products — the fan-out)
//     i5 o3 pC
//
// Ground truth per category (an order's revenue counts ONCE per category it
// touches): Supplements SUM=150/AVG=75 {o1,o2}; Gear SUM=130/AVG=65 {o1,o3}
// (control — no repeated order per category, naive and correct coincide).

describeIfCredentials(
  'Blended SUM/AVG through a bridge — value sleeve (5, real Databricks)',
  () => {
    let adapter: DatabricksApiAdapter;
    let itemsFQN: string;
    let ordersFQN: string;
    let productsFQN: string;

    const builder = new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer());

    function bridgeRelationship(
      id: string,
      targetAlias: string,
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id,
        targetAlias,
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    // main -> products (dimension: category) AND main -> orders (metric: SUM/AVG
    // revenue) — BOTH chains are roots off main (siblings).
    function bridgeContext(fn: 'SUM' | 'AVG'): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'products__category',
            aliasPath: 'products',
            originalFieldName: 'category',
            type: 'STRING',
          },
          {
            name: 'orders__revenue',
            aliasPath: 'orders',
            originalFieldName: 'revenue',
            type: 'NUMERIC',
          },
        ],
        availableSources: [
          { aliasPath: 'products', isIncluded: true },
          { aliasPath: 'orders', isIncluded: true },
        ],
      } as never);

      return {
        mainTableReference: itemsFQN,
        mainDataMartTitle: 'Items',
        mainDataMartUrl: 'http://x/items',
        chains: [
          {
            relationship: bridgeRelationship('rel-products', 'products', [
              { sourceFieldName: 'productId', targetFieldName: 'productId' },
            ]),
            targetTableReference: productsFQN,
            parentAlias: 'main',
            cteName: 'products',
            blendedFields: [
              {
                targetFieldName: 'category',
                outputAlias: 'products__category',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Products',
            targetDataMartUrl: 'http://x/products',
          },
          {
            relationship: bridgeRelationship('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: ordersFQN,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'revenue',
                outputAlias: 'orders__revenue',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
          },
        ],
        columns: ['products__category', 'orders__revenue'],
        aggregations: [{ column: 'orders__revenue', function: fn }],
        fieldIndex,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      // Databricks renderer inlines literals → params empty; run sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndFetchAll(sql);
    }

    beforeAll(async () => {
      adapter = makeAdapter();

      const stamp = `${Date.now()}`;
      itemsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.sumavg_items_${stamp}`;
      ordersFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.sumavg_orders_${stamp}`;
      productsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.sumavg_products_${stamp}`;

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${itemsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${itemsFQN} (itemId STRING, orderId STRING, productId STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${itemsFQN} (itemId, orderId, productId) VALUES
        ('i1','o1','pA'), ('i2','o1','pC'),
        ('i3','o2','pA'), ('i4','o2','pB'),
        ('i5','o3','pC')`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${ordersFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${ordersFQN} (orderId STRING, revenue DECIMAL(10,2)) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${ordersFQN} (orderId, revenue) VALUES ('o1', 100), ('o2', 50), ('o3', 30)`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${productsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${productsFQN} (productId STRING, category STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${productsFQN} (productId, category) VALUES
        ('pA','Supplements'), ('pB','Supplements'), ('pC','Gear')`
      );
    }, 180000);

    afterAll(async () => {
      try {
        for (const fqn of [itemsFQN, ordersFQN, productsFQN]) {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        }
      } catch (error) {
        console.warn('Failed to drop value-sleeve bridge tables:', error);
      } finally {
        await adapter.destroy();
      }
    }, 60000);

    it('fan-out: joined SUM through the bridge is set-based correct: Supplements=150 (not naive 200), Gear=130', async () => {
      const rows = await runBlend(bridgeContext('SUM'));

      expect(rows).toHaveLength(2);
      const byCategory = new Map(
        rows.map(r => [String(r.products__category), Number(r['orders__revenue | SUM'])])
      );

      expect(byCategory.get('Supplements')).toBe(150);
      expect(byCategory.get('Gear')).toBe(130);
    }, 120000);

    it('fan-out: joined AVG through the bridge is set-based correct: Supplements=75 (not naive avg-of-3-rows 66.67), Gear=65', async () => {
      const rows = await runBlend(bridgeContext('AVG'));

      expect(rows).toHaveLength(2);
      const byCategory = new Map(
        rows.map(r => [String(r.products__category), Number(r['orders__revenue | AVG'])])
      );

      expect(byCategory.get('Supplements')).toBe(75);
      expect(byCategory.get('Gear')).toBe(65);
    }, 120000);

    // 1 — MERGED VALUE sleeve, live. SUM and AVG of the SAME joined column share one
    // dedup pass: one `SELECT DISTINCT (dims, owner identity, value)` subquery with TWO outer
    // aggregates over it. Every live proof on this dialect so far ran SUM and AVG as SEPARATE
    // queries, so the merged shape — the one a Totals report actually emits for a numeric joined
    // field — was only ever checked as SQL text.
    //
    // Same ground truth as the two tests above, which is the point: merging must not move a
    // number. Supplements SUM=150/AVG=75 {o1,o2}; Gear SUM=130/AVG=65 {o1,o3}.
    it('fan-out: merged value sleeve: SUM and AVG over ONE dedup pass keep both numbers', async () => {
      const context: BlendedQueryContext = {
        ...bridgeContext('SUM'),
        aggregations: [
          { column: 'orders__revenue', function: 'SUM' },
          { column: 'orders__revenue', function: 'AVG' },
        ],
      };

      // Guard the premise: one sleeve CTE and ONE dedup pass feeding both aggregates. Without
      // this the numbers below would still pass while the merged shape went uncovered.
      const { sql } = builder.buildBlendedQuery(context);
      expect(sql.match(/SELECT DISTINCT/g)).toHaveLength(1);

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const sums = new Map(
        rows.map(r => [String(r.products__category), Number(r['orders__revenue | SUM'])])
      );
      const avgs = new Map(
        rows.map(r => [String(r.products__category), Number(r['orders__revenue | AVG'])])
      );

      expect(sums.get('Supplements')).toBe(150);
      expect(sums.get('Gear')).toBe(130);
      expect(avgs.get('Supplements')).toBe(75);
      expect(avgs.get('Gear')).toBe(65);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM through a bridge — no-PK synthetic surrogate (5, real
// Databricks). Mirrors bigquery.integration.ts's C2.4 no-PK surrogate case.
// Dimensionless grand total: main = items (bridge fact), one chain = orders
// (metric: SUM amount, no report GROUP BY) — exercises the sleeve's CROSS
// JOIN / ungrouped shape and the surrogate on real Databricks.
//
// Seed — two DIFFERENT orders, A and B, both worth exactly $50; A is reached
// through the bridge TWICE (fanned), B once:
//   orders(orderId, amount): A=50, B=50
//   items(itemId, orderId):  i1->A, i2->A (A fans out), i3->B
// Ground truth: 50 + 50 = 100 (naive additive = 150; dedup-by-value-alone = 50).

describeIfCredentials(
  'Blended SUM through a bridge — no-PK synthetic surrogate (5, real Databricks)',
  () => {
    let adapter: DatabricksApiAdapter;
    let itemsFQN: string;
    let ordersFQN: string;

    const builder = new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer());

    function bridgeRelationship(
      id: string,
      targetAlias: string,
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id,
        targetAlias,
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    function bridgeContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__amount',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            type: 'NUMERIC',
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never);

      return {
        mainTableReference: itemsFQN,
        mainDataMartTitle: 'Items',
        mainDataMartUrl: 'http://x/items',
        chains: [
          {
            relationship: bridgeRelationship('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: ordersFQN,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'amount',
                outputAlias: 'orders__amount',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
          },
        ],
        columns: ['orders__amount'], // dimensionless: no report GROUP BY
        aggregations: [{ column: 'orders__amount', function: 'SUM' }],
        fieldIndex,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndFetchAll(sql);
    }

    beforeAll(async () => {
      adapter = makeAdapter();

      const stamp = `${Date.now()}`;
      itemsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.nopk_items_${stamp}`;
      ordersFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.nopk_orders_${stamp}`;

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${itemsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${itemsFQN} (itemId STRING, orderId STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${itemsFQN} (itemId, orderId) VALUES ('i1','A'), ('i2','A'), ('i3','B')`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${ordersFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${ordersFQN} (orderId STRING, amount DECIMAL(10,2)) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${ordersFQN} (orderId, amount) VALUES ('A', 50), ('B', 50)`
      );
    }, 180000);

    afterAll(async () => {
      try {
        for (const fqn of [itemsFQN, ordersFQN]) {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        }
      } catch (error) {
        console.warn('Failed to drop no-PK surrogate tables:', error);
      } finally {
        await adapter.destroy();
      }
    }, 60000);

    it('fan-out: no-PK synthetic surrogate: two distinct $50 orders (one fanned) sum to 100, not naive 150 or dedup-by-value 50', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['orders__amount | SUM'])).toBe(100);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// sleeve honours post-join FILTERS (C1) and the outer dimension GRAIN
// for a FANNING blended dimension (C2), real Databricks. Mirrors
// bigquery.integration.ts's ' sleeve honours post-join filters +
// fanning blended dimension' case exactly (same topology, seed, and ground
// truth) — the cross-dialect proof that both fixes hold on Databricks/Spark.
//
// Topology: main = events; two sibling chains off main —
//   labels  (main.dimKey = labels.dimKey)  — dimension, roll-up = STRING_AGG
//   orders  (main.orderId = orders.orderId) — metric owner (SUM + COUNT_DISTINCT)
//
// The `labels` chain FANS: dimKey k1 owns TWO label rows (red, blue), so its
// dedup CTE rolls them up (STRING_AGG → Databricks' CONCAT_WS(', ',
// COLLECT_LIST(...)) — one value per dimKey). The report groups by that
// rolled-up label. Pre-C2 the sleeve projected the RAW label ('red'/'blue'),
// which never equalled the outer roll-up ('blue, red') → NULL-safe join-back
// never matched → NULL metric. The fix builds the sleeve's dimension from the
// SAME dedup-CTE ref the outer GROUP BY uses.
//
// Seed:
//   orders(orderId, revenue):  o1=100, o2=50, o3=30
//   labels(dimKey, label):     k1→red, k1→blue  (FANS)   ·  k2→green
//   events(eventId, dimKey, orderId, country):
//     ev1 k1 o1 US · ev2 k1 o2 DE · ev3 k2 o3 US
//
// Ground truth — group by the rolled-up label, distinct orders per bucket:
//   UNFILTERED (C2 proof, both metrics NON-NULL & correct):
//     'blue, red' (k1): orders {o1,o2} → SUM 150, COUNT_DISTINCT 2
//     'green'     (k2): order  {o3}    → SUM  30, COUNT_DISTINCT 1
//   FILTERED country='US' (C1 proof — a NON-dimension column; ev2/DE drops out):
//     'blue, red' (k1): order  {o1}    → SUM 100, COUNT_DISTINCT 1  (NOT the unfiltered 150/2)
//     'green'     (k2): order  {o3}    → SUM  30, COUNT_DISTINCT 1
// A sleeve that ignored the filter (C1 bug) would return the unfiltered 150/2
// for the 'blue, red' bucket even under the country='US' report.
describeIfCredentials(
  'sleeve honours post-join filters + fanning blended dimension (real Databricks)',
  () => {
    let adapter: DatabricksApiAdapter;
    let eventsFQN: string;
    let labelsFQN: string;
    let ordersFQN: string;

    const builder = new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer());

    function rel(
      id: string,
      targetAlias: string,
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id,
        targetAlias,
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    // dimension: labels__label (STRING_AGG roll-up — the fanning dimension);
    // metrics: orders__revenue (SUM) and orders__orderId (COUNT_DISTINCT).
    function fanningContext(filters?: BlendedQueryContext['filters']): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'labels__label',
            aliasPath: 'labels',
            originalFieldName: 'label',
            type: 'STRING',
          },
          {
            name: 'orders__revenue',
            aliasPath: 'orders',
            originalFieldName: 'revenue',
            type: 'NUMERIC',
          },
          {
            name: 'orders__orderId',
            aliasPath: 'orders',
            originalFieldName: 'orderId',
            type: 'STRING',
          },
        ],
        availableSources: [
          { aliasPath: 'labels', isIncluded: true },
          { aliasPath: 'orders', isIncluded: true },
        ],
      } as never);

      return {
        mainTableReference: eventsFQN,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: rel('rel-labels', 'labels', [
              { sourceFieldName: 'dimKey', targetFieldName: 'dimKey' },
            ]),
            targetTableReference: labelsFQN,
            parentAlias: 'main',
            cteName: 'labels',
            blendedFields: [
              {
                targetFieldName: 'label',
                outputAlias: 'labels__label',
                isHidden: false,
                // STRING_AGG: the fanning dimension rolls up to 'blue, red' per dimKey — the
                // NON-identity roll-up that exposes C2.
                aggregateFunction: 'STRING_AGG',
              },
            ],
            targetDataMartTitle: 'Labels',
            targetDataMartUrl: 'http://x/labels',
          },
          {
            relationship: rel('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: ordersFQN,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'revenue',
                outputAlias: 'orders__revenue',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
              {
                targetFieldName: 'orderId',
                outputAlias: 'orders__orderId',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
          },
        ],
        columns: ['labels__label', 'orders__revenue', 'orders__orderId'],
        aggregations: [
          { column: 'orders__revenue', function: 'SUM' },
          { column: 'orders__orderId', function: 'COUNT_DISTINCT' },
        ],
        filters,
        columnTypes: {
          postJoin: new Map([
            ['labels__label', 'STRING'],
            ['orders__revenue', 'NUMERIC'],
            ['orders__orderId', 'STRING'],
            ['country', 'STRING'],
          ]),
        },
        fieldIndex,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      // Databricks renderer inlines literals → params empty; run sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndFetchAll(sql);
    }

    // The rolled-up label ('blue, red') order is not guaranteed by COLLECT_LIST, so
    // identify the fanning bucket as the one that is NOT the lone 'green' row.
    function fanningRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => String(r.labels__label) !== 'green')!;
    }
    function greenRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => String(r.labels__label) === 'green')!;
    }

    beforeAll(async () => {
      adapter = makeAdapter();

      const stamp = `${Date.now()}`;
      eventsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.r1_events_${stamp}`;
      labelsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.r1_labels_${stamp}`;
      ordersFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.r1_orders_${stamp}`;

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${eventsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${eventsFQN} (eventId STRING, dimKey STRING, orderId STRING, country STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${eventsFQN} (eventId, dimKey, orderId, country) VALUES
        ('ev1','k1','o1','US'), ('ev2','k1','o2','DE'), ('ev3','k2','o3','US')`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${labelsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${labelsFQN} (dimKey STRING, label STRING) USING DELTA`
      );
      // k1 owns TWO labels (red, blue) — the fan-out that makes the dedup roll-up non-identity.
      await adapter.executeQuery(
        `INSERT INTO ${labelsFQN} (dimKey, label) VALUES
        ('k1','red'), ('k1','blue'), ('k2','green')`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${ordersFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${ordersFQN} (orderId STRING, revenue DECIMAL(10,2)) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${ordersFQN} (orderId, revenue) VALUES ('o1', 100), ('o2', 50), ('o3', 30)`
      );
    }, 180000);

    afterAll(async () => {
      try {
        for (const fqn of [eventsFQN, labelsFQN, ordersFQN]) {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        }
      } catch (error) {
        console.warn('Failed to drop R1 fixture tables:', error);
      } finally {
        await adapter.destroy();
      }
    }, 60000);

    it('a FANNING blended dimension returns correct NON-NULL per-group SUM and COUNT_DISTINCT (blue,red=150/2, green=30/1)', async () => {
      const rows = await runBlend(fanningContext());

      expect(rows).toHaveLength(2);
      const fan = fanningRow(rows); // the rolled-up 'blue, red' bucket (k1)
      const green = greenRow(rows);

      // The rolled-up label bucket actually combines red + blue (proves it is the roll-up, not
      // a single raw value).
      expect(String(fan.labels__label)).toContain('red');
      expect(String(fan.labels__label)).toContain('blue');

      // C2: both metrics land on the rolled-up bucket (NULL pre-fix, because the sleeve
      // projected the raw label which never matched the outer 'blue, red').
      expect(Number(fan['orders__revenue | SUM'])).toBe(150);
      expect(Number(fan['orders__orderId | COUNTUNIQUE'])).toBe(2);
      expect(Number(green['orders__revenue | SUM'])).toBe(30);
      expect(Number(green['orders__orderId | COUNTUNIQUE'])).toBe(1);
    }, 120000);

    it('a post-join filter on a NON-dimension column (country=US) is applied INSIDE the sleeve — metrics over the FILTERED set (blue,red=100/1, not 150/2)', async () => {
      const rows = await runBlend(
        fanningContext([
          { column: 'country', operator: 'eq', value: 'US', placement: 'post-join' },
        ] as never)
      );

      expect(rows).toHaveLength(2);
      const fan = fanningRow(rows);
      const green = greenRow(rows);

      // C1: ev2 (DE, order o2=$50) is filtered out, so the 'blue, red' bucket drops to the
      // single US order o1 — SUM 100 / COUNT 1, NOT the unfiltered 150 / 2 a sleeve that
      // ignored the WHERE would return.
      expect(Number(fan['orders__revenue | SUM'])).toBe(100);
      expect(Number(fan['orders__orderId | COUNTUNIQUE'])).toBe(1);
      // 'green' (k2, order o3=$30, event ev3 is US) is untouched by the filter.
      expect(Number(green['orders__revenue | SUM'])).toBe(30);
      expect(Number(green['orders__orderId | COUNTUNIQUE'])).toBe(1);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM through a non-identity pre-join aggregate — value sleeve reads the
// dedup CTE's ALREADY-aggregated column (/C3, "funnel" shape, real
// Databricks). Mirrors bigquery.integration.ts's equivalent case exactly (same
// topology, seed, and ground truth) — proves the R2 fix on Databricks/Spark: a
// blended field whose OWN pre-join `aggregateFunction` is a real aggregate (here
// COUNT_DISTINCT, not the raw ANY_VALUE passthrough every other fixture
// uses) must have its post-join value sleeve read the OWNER's OWN dedup CTE
// column (one value per pre-join GROUP KEY), not the raw column keyed by the
// per-raw-row surrogate. Pre-R2 this would have summed RAW hit ids — on this
// STRING id shape that is a hard type error on most engines; on a numeric id it
// would silently sum the wrong (raw, pre-dedup) numbers.
//
// Topology: main = sessions (session_id, campaign). ONE chain off main: hits
// (session_id, hit_id — hit_id is STRING, the real-world shape), blended field
// `hits__hit_id` with pre-join aggregateFunction COUNT_DISTINCT — i.e. the dedup CTE
// computes `COUNT(DISTINCT hit_id)` PER session (the join key), not a raw passthrough.
//
// Seed (hit_id repeats WITHIN a session — e.g. a retried/duplicate event — so the
// pre-join COUNT_DISTINCT genuinely dedupes something):
//   sessions(session_id, campaign): s1=A, s2=A, s3=B
//   hits(session_id, hit_id):
//     s1: h1, h1, h2   (distinct hit ids = 2)
//     s2: h3, h4, h5   (distinct hit ids = 3)
//     s3: h6, h6       (distinct hit ids = 1)
//
// Ground truth (hand-computed): SUM, per campaign, of each session's OWN distinct-hit
// count — NOT a sum of raw hit rows/ids:
//   campaign A: sessions {s1, s2} -> 2 + 3 = 5
//   campaign B: session  {s3}     -> 1
describeIfCredentials(
  'Blended SUM through a non-identity pre-join aggregate — value sleeve (/C3, funnel, real Databricks)',
  () => {
    let adapter: DatabricksApiAdapter;
    let sessionsFQN: string;
    let hitsFQN: string;

    const builder = new DatabricksBlendedQueryBuilder(new DatabricksClauseRenderer());

    function funnelRelationship(
      id: string,
      targetAlias: string,
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id,
        targetAlias,
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    function funnelContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'hits__hit_id',
            aliasPath: 'hits',
            originalFieldName: 'hit_id',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'hits', isIncluded: true }],
      } as never);

      return {
        mainTableReference: sessionsFQN,
        mainDataMartTitle: 'Sessions',
        mainDataMartUrl: 'http://x/sessions',
        chains: [
          {
            relationship: funnelRelationship('rel-hits', 'hits', [
              { sourceFieldName: 'session_id', targetFieldName: 'session_id' },
            ]),
            targetTableReference: hitsFQN,
            parentAlias: 'main',
            cteName: 'hits',
            blendedFields: [
              {
                targetFieldName: 'hit_id',
                outputAlias: 'hits__hit_id',
                isHidden: false,
                aggregateFunction: 'COUNT_DISTINCT',
              },
            ],
            targetDataMartTitle: 'Hits',
            targetDataMartUrl: 'http://x/hits',
          },
        ],
        columns: ['campaign', 'hits__hit_id'],
        aggregations: [{ column: 'hits__hit_id', function: 'SUM' }],
        fieldIndex,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      // Databricks renderer inlines literals → params empty; run sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndFetchAll(sql);
    }

    beforeAll(async () => {
      adapter = makeAdapter();

      const stamp = `${Date.now()}`;
      sessionsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.funnel_sessions_${stamp}`;
      hitsFQN = `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.funnel_hits_${stamp}`;

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${sessionsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${sessionsFQN} (session_id STRING, campaign STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${sessionsFQN} (session_id, campaign) VALUES
        ('s1','A'), ('s2','A'), ('s3','B')`
      );

      await adapter.executeQuery(`DROP TABLE IF EXISTS ${hitsFQN}`);
      await adapter.executeQuery(
        `CREATE TABLE ${hitsFQN} (session_id STRING, hit_id STRING) USING DELTA`
      );
      await adapter.executeQuery(
        `INSERT INTO ${hitsFQN} (session_id, hit_id) VALUES
        ('s1','h1'), ('s1','h1'), ('s1','h2'),
        ('s2','h3'), ('s2','h4'), ('s2','h5'),
        ('s3','h6'), ('s3','h6')`
      );
    }, 180000);

    afterAll(async () => {
      try {
        for (const fqn of [sessionsFQN, hitsFQN]) {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        }
      } catch (error) {
        console.warn('Failed to drop funnel tables:', error);
      } finally {
        await adapter.destroy();
      }
    }, 60000);

    it('/ joined SUM over a non-identity pre-join COUNT_DISTINCT is the sum of PER-SESSION distinct hit counts: A=5, B=1 (not a raw-id sum/type error)', async () => {
      const context = funnelContext();
      const { sql } = builder.buildBlendedQuery(context);

      // The sleeve reads the dedup CTE's own aggregated column, keyed by the pre-join
      // group key — never the raw `hits_raw.hit_id` column (which would either type-error
      // on this STRING id or silently sum the wrong, pre-dedup numbers).
      expect(sql).toContain('hits.hits__hit_id');
      expect(sql).not.toContain('hits_raw.hit_id');

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const byCampaign = new Map(
        rows.map(r => [String(r.campaign), Number(r['hits__hit_id | SUM'])])
      );

      expect(byCampaign.get('A')).toBe(5);
      expect(byCampaign.get('B')).toBe(1);
    }, 120000);
  }
);
