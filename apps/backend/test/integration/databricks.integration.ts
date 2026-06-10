import { DatabricksApiAdapter } from 'src/data-marts/data-storage-types/databricks/adapters/databricks-api.adapter';
import { DatabricksCredentials } from 'src/data-marts/data-storage-types/databricks/schemas/databricks-credentials.schema';
import { DatabricksConfig } from 'src/data-marts/data-storage-types/databricks/schemas/databricks-config.schema';
import { DatabricksAuthMethod } from 'src/data-marts/data-storage-types/databricks/enums/databricks-auth-method.enum';
import { DatabricksQueryBuilder } from 'src/data-marts/data-storage-types/databricks/services/databricks-query.builder';
import { DatabricksClauseRenderer } from 'src/data-marts/data-storage-types/databricks/services/databricks-clause-renderer';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';

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
//   DATABRICKS_HOST      — workspace host, e.g. https://dbc-xxxx.cloud.databricks.com
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
});
