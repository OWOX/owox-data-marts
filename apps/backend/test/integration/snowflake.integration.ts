import { SnowflakeApiAdapter } from 'src/data-marts/data-storage-types/snowflake/adapters/snowflake-api.adapter';
import { SnowflakeCredentials } from 'src/data-marts/data-storage-types/snowflake/schemas/snowflake-credentials.schema';
import { SnowflakeConfig } from 'src/data-marts/data-storage-types/snowflake/schemas/snowflake-config.schema';
import { SnowflakeAuthMethod } from 'src/data-marts/data-storage-types/snowflake/enums/snowflake-auth-method.enum';
import { SnowflakeClauseRenderer } from 'src/data-marts/data-storage-types/snowflake/services/snowflake-clause-renderer';
import { SnowflakeQueryBuilder } from 'src/data-marts/data-storage-types/snowflake/services/snowflake-query.builder';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';
import { DataMartQueryOptions } from 'src/data-marts/data-storage-types/interfaces/data-mart-query-builder.interface';

/**
 * Snowflake Integration Tests
 *
 * Live integration suite that runs against a REAL Snowflake account.
 * Every test in this file sends SQL to the actual cluster — nothing here
 * is mocked. The suite finalises two open design decisions:
 *
 *   §0 PROBE 1 — Backslash round-trip: does the renderer's `\`→`\\` doubling
 *      produce a correct match for the stored literal `a\b`?
 *
 *   §0 PROBE 2 — CAST necessity: does Snowflake accept a bare quoted string
 *      literal in comparisons against TIMESTAMP_NTZ columns WITHOUT a CAST?
 *
 * Required environment variables (loaded from .env.tests):
 *   SNOWFLAKE_ACCOUNT    — Snowflake account identifier
 *   SNOWFLAKE_WAREHOUSE  — Warehouse to use
 *   SNOWFLAKE_USERNAME   — Login username
 *   SNOWFLAKE_PASSWORD   — Login password
 *   SNOWFLAKE_DATABASE   — Database containing the test schema
 *   SNOWFLAKE_SCHEMA     — Schema in which the test table is created
 *   SNOWFLAKE_ROLE       — (optional) Role to activate
 */

const SNOWFLAKE_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT;
const SNOWFLAKE_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE;
const SNOWFLAKE_USERNAME = process.env.SNOWFLAKE_USERNAME;
const SNOWFLAKE_PASSWORD = process.env.SNOWFLAKE_PASSWORD;
const SNOWFLAKE_DATABASE = process.env.SNOWFLAKE_DATABASE;
const SNOWFLAKE_SCHEMA = process.env.SNOWFLAKE_SCHEMA;
const SNOWFLAKE_ROLE = process.env.SNOWFLAKE_ROLE;

const SNOWFLAKE_CREDENTIALS_AVAILABLE = !!(
  SNOWFLAKE_ACCOUNT &&
  SNOWFLAKE_WAREHOUSE &&
  SNOWFLAKE_USERNAME &&
  SNOWFLAKE_PASSWORD &&
  SNOWFLAKE_DATABASE &&
  SNOWFLAKE_SCHEMA
);

if (!SNOWFLAKE_CREDENTIALS_AVAILABLE) {
  const missing: string[] = [];
  if (!SNOWFLAKE_ACCOUNT) missing.push('SNOWFLAKE_ACCOUNT');
  if (!SNOWFLAKE_WAREHOUSE) missing.push('SNOWFLAKE_WAREHOUSE');
  if (!SNOWFLAKE_USERNAME) missing.push('SNOWFLAKE_USERNAME');
  if (!SNOWFLAKE_PASSWORD) missing.push('SNOWFLAKE_PASSWORD');
  if (!SNOWFLAKE_DATABASE) missing.push('SNOWFLAKE_DATABASE');
  if (!SNOWFLAKE_SCHEMA) missing.push('SNOWFLAKE_SCHEMA');
  console.log(`Skipping Snowflake integration tests: missing env vars: ${missing.join(', ')}`);
}

const describeIfSnowflakeCredentials = SNOWFLAKE_CREDENTIALS_AVAILABLE ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Operator matrix + design-decision probes
// ---------------------------------------------------------------------------
// Seed rows:
//   id  name        amount   status    date_col             ts_col (non-midnight for rows 1,6)
//    1  alpha         10.0   active    today                today@13:45
//    2  beta          20.0   inactive  yesterday            yesterday@00:00
//    3  O'Brien       30.0   active    -40 days             -40d@00:00
//    4  100%          40.0   inactive  -400 days (last yr)  -400d@00:00
//    5  a\b           50.0   active    +13 months (next yr) next_year@00:00
//    6  gamma          0.0   active    today                today@13:45
//
// Row 5: future-dated for this_year / this_month upper-bound exclusion.
// Rows 1,6: today at 13:45 for relative_date non-midnight timestamp check.
// Row 3: O'Brien for single-quote round-trip safety.
// Row 4: 100% for wildcard-literal (CONTAINS, not LIKE) safety.
// Row 5: a\b for backslash escape probe (§0 PROBE 1).

// Date.now() + Math.random() are allowed in integration test files (not workflow scripts).
const MATRIX_TABLE_SUFFIX = `sf_matrix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const MATRIX_FQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."${MATRIX_TABLE_SUFFIX}"`;

describeIfSnowflakeCredentials(
  'Snowflake — backslash probe, CAST-necessity probe, operator matrix',
  () => {
    let adapter: SnowflakeApiAdapter;

    const builder = new SnowflakeQueryBuilder(new SnowflakeClauseRenderer());
    const definition: TableDefinition = {
      get fullyQualifiedName() {
        return MATRIX_FQN;
      },
    };

    async function runFilter(
      queryOptions: DataMartQueryOptions
    ): Promise<Array<Record<string, unknown>>> {
      const sql = builder.buildQuery(definition, queryOptions) as string;
      return adapter.executeQueryAndFetchAll(sql);
    }

    function ids(rows: Array<Record<string, unknown>>): string[] {
      return rows.map(r => String(r.id ?? r.ID ?? '')).sort((a, b) => Number(a) - Number(b));
    }

    beforeAll(async () => {
      const credentials: SnowflakeCredentials = {
        authMethod: SnowflakeAuthMethod.PASSWORD,
        username: SNOWFLAKE_USERNAME!,
        password: SNOWFLAKE_PASSWORD!,
      };
      const config: SnowflakeConfig = {
        account: SNOWFLAKE_ACCOUNT!,
        warehouse: SNOWFLAKE_WAREHOUSE!,
        ...(SNOWFLAKE_ROLE ? { role: SNOWFLAKE_ROLE } : {}),
      };
      adapter = new SnowflakeApiAdapter(credentials, config);

      // Establish the connection BEFORE the pre-cleanup try/catch. The Snowflake SDK
      // transitions a connection to the fatal StateDisconnected if connect() fails,
      // and a subsequent try/catch around executeQuery would silently swallow that
      // connection error, leaving the adapter permanently unusable.
      await adapter.checkAccess();

      // Pre-cleanup in case of a previous crash
      try {
        await adapter.executeQuery(`DROP TABLE IF EXISTS ${MATRIX_FQN}`);
      } catch {
        // ignore — table may not exist on first run
      }

      // QUOTED lowercase column names: Snowflake folds unquoted identifiers to
      // UPPERCASE. The clause renderer emits `"id"` (lowercase), so the CREATE
      // must also use quoted lowercase column names to prevent a casing mismatch.
      await adapter.executeQuery(`
        CREATE TABLE ${MATRIX_FQN} (
          "id"       INTEGER,
          "name"     VARCHAR(100),
          "amount"   NUMBER(10,2),
          "status"   VARCHAR(20),
          "date_col" DATE,
          "ts_col"   TIMESTAMP_NTZ,
          "time_col" TIME
        )
      `);

      // Insert seed rows.
      // Row 5 stores name = a\b (one literal backslash). The renderer emits `'a\\b'` in
      // SQL (doubled backslash); the seed must emit the SAME `'a\\b'` so the round-trip
      // matches — hence 'a\\\\b' here (a JS template literal collapses \\\\ → \\).
      await adapter.executeQuery(`
        INSERT INTO ${MATRIX_FQN}
          ("id", "name", "amount", "status", "date_col", "ts_col", "time_col")
        VALUES
          (1, 'alpha',    10.00, 'active',
            CURRENT_DATE,
            DATEADD(minute, 825, CAST(CURRENT_DATE AS TIMESTAMP_NTZ)),
            '13:45:00'),
          (2, 'beta',     20.00, 'inactive',
            DATEADD(day, -1, CURRENT_DATE),
            CAST(DATEADD(day, -1, CURRENT_DATE) AS TIMESTAMP_NTZ),
            '09:00:00'),
          (3, 'O''Brien', 30.00, 'active',
            DATEADD(day, -40, CURRENT_DATE),
            CAST(DATEADD(day, -40, CURRENT_DATE) AS TIMESTAMP_NTZ),
            '00:00:00'),
          (4, '100%',     40.00, 'inactive',
            DATEADD(day, -400, CURRENT_DATE),
            CAST(DATEADD(day, -400, CURRENT_DATE) AS TIMESTAMP_NTZ),
            '23:59:00'),
          (5, 'a\\\\b',    50.00, 'active',
            DATEADD(month, 13, CURRENT_DATE),
            CAST(DATEADD(month, 13, CURRENT_DATE) AS TIMESTAMP_NTZ),
            '12:00:00'),
          (6, 'gamma',     0.00, 'active',
            CURRENT_DATE,
            DATEADD(minute, 825, CAST(CURRENT_DATE AS TIMESTAMP_NTZ)),
            '13:45:00')
      `);
    }, 120000);

    afterAll(async () => {
      try {
        await adapter.executeQuery(`DROP TABLE IF EXISTS ${MATRIX_FQN}`);
      } catch (error) {
        console.warn('Failed to drop Snowflake matrix test table:', error);
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    // -------------------------------------------------------------------------
    // §0 PROBE 1 — Backslash round-trip
    // -------------------------------------------------------------------------
    // Row 5 stores name = 'a\b' (one literal backslash).
    // The renderer doubles backslashes → emits `'a\\b'` in SQL.
    // Snowflake interprets `\\` as a single `\`, so the WHERE matches row 5.
    // If escaping is wrong the result count is 0 and we fail loudly.

    it('§0 PROBE 1 — backslash round-trip: eq "a\\b" → row 5 (count must be 1)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'eq', value: 'a\\b' }],
      });
      console.log(
        `[§0 PROBE 1] backslash eq match count: ${rows.length} ` +
          `(expected 1 — renderer's \\\\ doubling must match the stored literal a\\b)`
      );
      if (rows.length !== 1) {
        throw new Error(
          `§0 PROBE 1 FAILED: expected 1 row for eq "a\\b" but got ${rows.length}. ` +
            `This means backslash escaping is wrong in the SnowflakeClauseRenderer.`
        );
      }
      expect(rows.length).toBe(1);
    }, 30000);

    // -------------------------------------------------------------------------
    // §0 PROBE 2 — CAST necessity
    // -------------------------------------------------------------------------
    // Does Snowflake accept a bare string literal in a TIMESTAMP_NTZ comparison
    // without a CAST? The renderer currently emits CAST(...), but if bare literals
    // work the defensive CAST could be dropped.

    it('§0 PROBE 2 — CAST necessity: bare-literal date comparison on TIMESTAMP_NTZ', async () => {
      // First — run what the renderer already emits (with CAST). This must work.
      const withCastRows = await runFilter({
        filters: [{ column: 'ts_col', operator: 'gte', value: '2020-01-01' }],
        columnTypes: new Map([['ts_col', 'TIMESTAMP']]),
      });
      console.log(
        `[§0 PROBE 2] renderer's CAST form: ${withCastRows.length} rows returned, no error`
      );

      // Second — probe the bare-literal form directly (no CAST), to determine
      // whether the defensive CAST is strictly required or just defensive.
      let bareResult: 'works' | 'errors' = 'works';
      let bareCount = 0;
      try {
        const bareRows = await adapter.executeQueryAndFetchAll(
          `SELECT * FROM ${MATRIX_FQN} WHERE "ts_col" >= '2020-01-01'`
        );
        bareCount = bareRows.length;
        bareResult = 'works';
      } catch {
        bareResult = 'errors';
      }
      console.log(
        `[§0 PROBE 2] bare-literal date comparison on TIMESTAMP_NTZ: ${bareResult}` +
          (bareResult === 'works' ? ` (${bareCount} rows)` : '')
      );
      console.log(`[CAST NECESSITY] bare-literal date comparison: ${bareResult}`);
      // Regardless of bare result, the renderer's CAST form must return rows.
      expect(withCastRows.length).toBeGreaterThan(0);
    }, 30000);

    // -------------------------------------------------------------------------
    // Operator matrix
    // -------------------------------------------------------------------------

    it('eq on name → row 1 (alpha)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'eq', value: 'alpha' }],
      });
      expect(ids(rows)).toEqual(['1']);
    }, 30000);

    it('neq on status: not "active" → rows 2,4 (inactive)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'status', operator: 'neq', value: 'active' }],
      });
      expect(ids(rows)).toEqual(['2', '4']);
    }, 30000);

    it('gt: amount > 20 → rows 3,4,5 (30,40,50)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'gt', value: 20 }],
      });
      expect(ids(rows)).toEqual(['3', '4', '5']);
    }, 30000);

    it('lt: amount < 20 → rows 1,6 (10,0)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'lt', value: 20 }],
      });
      expect(ids(rows)).toEqual(['1', '6']);
    }, 30000);

    it('gte: amount >= 20 → rows 2,3,4,5 (20,30,40,50)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'gte', value: 20 }],
      });
      expect(ids(rows)).toEqual(['2', '3', '4', '5']);
    }, 30000);

    it('lte: amount <= 20 → rows 1,2,6 (10,20,0)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'lte', value: 20 }],
      });
      expect(ids(rows)).toEqual(['1', '2', '6']);
    }, 30000);

    it('contains "alph" on name → row 1 (alpha)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'contains', value: 'alph' }],
      });
      expect(ids(rows)).toEqual(['1']);
    }, 30000);

    it('not_contains "eta" on name → rows 1,3,4,5,6 (all except beta)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_contains', value: 'eta' }],
      });
      expect(ids(rows)).toEqual(['1', '3', '4', '5', '6']);
    }, 30000);

    it('starts_with "al" on name → row 1 (alpha)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'starts_with', value: 'al' }],
      });
      expect(ids(rows)).toEqual(['1']);
    }, 30000);

    it('ends_with "a" on name → rows 1,2,6 (alpha,beta,gamma all end in "a")', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'ends_with', value: 'a' }],
      });
      expect(ids(rows)).toEqual(['1', '2', '6']);
    }, 30000);

    it('regex: name REGEXP_INSTR "^alp" → row 1 (partial match)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'regex', value: '^alp' }],
      });
      expect(ids(rows)).toEqual(['1']);
    }, 30000);

    it('not_regex: name NOT REGEXP_INSTR "^alp" → rows 2,3,4,5,6', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_regex', value: '^alp' }],
      });
      expect(ids(rows)).toEqual(['2', '3', '4', '5', '6']);
    }, 30000);

    it('is_empty: no empty-name rows → 0 rows', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_empty' }],
      });
      expect(rows).toHaveLength(0);
    }, 30000);

    it('is_not_empty: all 6 rows have non-empty names', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_not_empty' }],
      });
      expect(rows).toHaveLength(6);
    }, 30000);

    it('is_null: no NULLs in seed → 0 rows', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_null' }],
      });
      expect(rows).toHaveLength(0);
    }, 30000);

    it('is_not_null: all 6 rows', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_not_null' }],
      });
      expect(rows).toHaveLength(6);
    }, 30000);

    it('between: amount BETWEEN 20 AND 30 → rows 2,3', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'between', value: { from: 20, to: 30 } }],
      });
      expect(ids(rows)).toEqual(['2', '3']);
    }, 30000);

    // -------------------------------------------------------------------------
    // relative_date today on non-midnight TIMESTAMP_NTZ column
    // -------------------------------------------------------------------------
    // Rows 1 and 6 have ts_col = today at 13:45. The half-open range
    // `>= CURRENT_DATE AND < DATEADD(day,1,CURRENT_DATE)` covers the full day.

    it('relative_date today on ts_col (13:45, non-midnight) → rows 1,6', async () => {
      const rows = await runFilter({
        filters: [{ column: 'ts_col', operator: 'relative_date', value: { kind: 'today' } }],
      });
      expect(ids(rows)).toEqual(['1', '6']);
    }, 30000);

    it('relative_date today on date_col → rows 1,6', async () => {
      const rows = await runFilter({
        filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'today' } }],
      });
      expect(ids(rows)).toEqual(['1', '6']);
    }, 30000);

    // -------------------------------------------------------------------------
    // this_year / this_month upper-bound exclusion
    // -------------------------------------------------------------------------
    // Row 5 (date_col = DATEADD(month,13,CURRENT_DATE)) is always next year.
    // this_year upper bound = DATEADD(year,1,DATE_TRUNC('year',CURRENT_DATE)) — excludes row 5.
    // Row 4 (-400 days) is always last year — also excluded.

    it('relative_date this_year excludes future-dated row 5 and last-year row 4', async () => {
      const rows = await runFilter({
        filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'this_year' } }],
      });
      const resultIds = ids(rows);
      expect(resultIds).not.toContain('5');
      expect(resultIds).not.toContain('4');
      expect(resultIds).toContain('1');
      expect(resultIds).toContain('6');
      console.log(`[this_year] rows returned: [${resultIds.join(',')}]`);
    }, 30000);

    it('relative_date this_month excludes future-dated row 5', async () => {
      const rows = await runFilter({
        filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'this_month' } }],
      });
      const resultIds = ids(rows);
      expect(resultIds).not.toContain('5');
      console.log(`[this_month] rows returned: [${resultIds.join(',')}]`);
    }, 30000);

    it('relative_date last_n_days(7): rows 1,2,6 (future row 5 excluded)', async () => {
      const rows = await runFilter({
        filters: [
          { column: 'date_col', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ],
      });
      expect(ids(rows)).toEqual(['1', '2', '6']);
    }, 30000);

    it('relative_date last_n_months(3): rows 1,2,3,6 (future row 5 excluded)', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'date_col',
            operator: 'relative_date',
            value: { kind: 'last_n_months', n: 3 },
          },
        ],
      });
      expect(ids(rows)).toEqual(['1', '2', '3', '6']);
    }, 30000);

    // -------------------------------------------------------------------------
    // Wildcard-literal safety
    // -------------------------------------------------------------------------

    it('SAFETY contains "100%" on name → only row 4 (% is not a wildcard in CONTAINS)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'contains', value: '100%' }],
      });
      expect(ids(rows)).toEqual(['4']);
    }, 30000);

    it('SAFETY eq "O\'Brien" → row 3 (single-quote doubling round-trip)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'eq', value: "O'Brien" }],
      });
      expect(ids(rows)).toEqual(['3']);
    }, 30000);

    // -------------------------------------------------------------------------
    // Sort + limit
    // -------------------------------------------------------------------------

    it('sort by amount DESC + limit 2 → rows 5,4 (amounts 50,40)', async () => {
      const rows = await runFilter({
        sort: [{ column: 'amount', direction: 'desc' }],
        limit: 2,
      });
      expect(rows.map(r => String(r.id ?? r.ID ?? ''))).toEqual(['5', '4']);
    }, 30000);
  }
);
