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
          cast(cast(current_date as timestamp) + interval 825 minute as timestamp_ntz))
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

  it('neq on status: not "active" → rows 2,4', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'status', operator: 'neq', value: 'active' }] }))
    ).toEqual(['2', '4']);
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

  it('not_contains "eta" → rows 1,3,4,5,6', async () => {
    expect(
      ids(
        await runFilter({ filters: [{ column: 'name', operator: 'not_contains', value: 'eta' }] })
      )
    ).toEqual(['1', '3', '4', '5', '6']);
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

  it('not_regex "^alp" → rows 2,3,4,5,6', async () => {
    expect(
      ids(await runFilter({ filters: [{ column: 'name', operator: 'not_regex', value: '^alp' }] }))
    ).toEqual(['2', '3', '4', '5', '6']);
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

      expect(rows).toHaveLength(2);
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

      expect(rows).toHaveLength(2);
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
      expect(Number(row['id | COUNTUNIQUE'])).toBe(6);
      expect(Number(row['Row Count'])).toBe(6);
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
