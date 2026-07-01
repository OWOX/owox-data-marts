import { SnowflakeApiAdapter } from 'src/data-marts/data-storage-types/snowflake/adapters/snowflake-api.adapter';
import { SnowflakeCredentials } from 'src/data-marts/data-storage-types/snowflake/schemas/snowflake-credentials.schema';
import { SnowflakeConfig } from 'src/data-marts/data-storage-types/snowflake/schemas/snowflake-config.schema';
import { SnowflakeAuthMethod } from 'src/data-marts/data-storage-types/snowflake/enums/snowflake-auth-method.enum';
import { SnowflakeClauseRenderer } from 'src/data-marts/data-storage-types/snowflake/services/snowflake-clause-renderer';
import { SnowflakeQueryBuilder } from 'src/data-marts/data-storage-types/snowflake/services/snowflake-query.builder';
import { SnowflakeBlendedQueryBuilder } from 'src/data-marts/data-storage-types/snowflake/services/snowflake-blended-query-builder';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';
import { DataMartQueryOptions } from 'src/data-marts/data-storage-types/interfaces/data-mart-query-builder.interface';
import { BlendedQueryContext } from 'src/data-marts/data-storage-types/interfaces/blended-query-builder.interface';
import { DataMartRelationship } from 'src/data-marts/entities/data-mart-relationship.entity';
import { buildBlendedFieldIndex } from 'src/data-marts/services/blended-field-index';

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
 */

const SNOWFLAKE_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT;
const SNOWFLAKE_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE;
const SNOWFLAKE_USERNAME = process.env.SNOWFLAKE_USERNAME;
const SNOWFLAKE_PASSWORD = process.env.SNOWFLAKE_PASSWORD;
const SNOWFLAKE_DATABASE = process.env.SNOWFLAKE_DATABASE;
const SNOWFLAKE_SCHEMA = process.env.SNOWFLAKE_SCHEMA;

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
    // §0 PROBE 2 — CAST necessity (DECISION: keep the CAST, it is defensive-only)
    // -------------------------------------------------------------------------
    // Snowflake accepts BOTH the renderer's CAST(...) form AND a bare string literal in a
    // TIMESTAMP_NTZ comparison (it coerces). The defensive CAST is therefore kept for
    // explicitness, not necessity. This is now asserted, not just logged.

    it('§0 PROBE 2 — CAST is defensive-only: both CAST and bare-literal date comparisons work', async () => {
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
      // The renderer's CAST form must return rows...
      expect(withCastRows.length).toBeGreaterThan(0);
      // ...and the bare-literal form must ALSO work, proving Snowflake coerces and the
      // defensive CAST is explicit-not-required (the finalized §0 decision).
      expect(bareResult).toBe('works');
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

    // -------------------------------------------------------------------------
    // Aggregation (real GROUP BY / percentile / date-trunc / totals)
    // -------------------------------------------------------------------------
    // Seed recap (amounts / status):
    //   id=1  alpha    10.00  active
    //   id=2  beta     20.00  inactive
    //   id=3  O'Brien  30.00  active
    //   id=4  100%     40.00  inactive
    //   id=5  a\b      50.00  active
    //   id=6  gamma     0.00  active
    //
    // active totals  → ids 1,3,5,6; amounts 0+10+30+50=90; avg=22.5; count=4
    // inactive totals → ids 2,4;    amounts 20+40=60;       avg=30.0; count=2
    //
    // PERCENTILE_CONT (exact linear interpolation) over {0,10,20,30,40,50} sorted:
    //   P25 = 10 + 0.25*10  = 12.5
    //   P50 = 20 + 0.5*10   = 25.0
    //   P75 = 30 + 0.75*10  = 37.5
    //   P95 = 40 + 0.75*10  = 47.5  ((5)*0.95=4.75 → sorted[4]+0.75*(sorted[5]-sorted[4]))

    describe('Aggregation (real GROUP BY / percentile / date-trunc / totals)', () => {
      // Case 1 — group-by + multi-fn (SUM + AVG + COUNT_DISTINCT) + Row Count
      it('group-by status + SUM/AVG/COUNT_DISTINCT/Row Count returns real per-group values', async () => {
        const rows = await runFilter({
          columns: ['status', 'amount', 'id'],
          rowCount: true,
          aggregations: [
            { column: 'amount', function: 'SUM' },
            { column: 'amount', function: 'AVG' },
            { column: 'id', function: 'COUNT_DISTINCT' },
          ],
        });

        expect(rows).toHaveLength(2);
        const byStatus = new Map(rows.map(r => [String(r.status ?? r.STATUS ?? ''), r]));

        const active = byStatus.get('active')!;
        expect(active).toBeDefined();
        expect(Number(active['amount | SUM'])).toBeCloseTo(90, 5);
        expect(Number(active['amount | AVG'])).toBeCloseTo(22.5, 5);
        expect(Number(active['id | COUNTUNIQUE'])).toBe(4);
        expect(Number(active['Row Count'])).toBe(4);

        const inactive = byStatus.get('inactive')!;
        expect(inactive).toBeDefined();
        expect(Number(inactive['amount | SUM'])).toBeCloseTo(60, 5);
        expect(Number(inactive['amount | AVG'])).toBeCloseTo(30.0, 5);
        expect(Number(inactive['id | COUNTUNIQUE'])).toBe(2);
        expect(Number(inactive['Row Count'])).toBe(2);
      }, 60000);

      // Case 2 — MIN / MAX / plain COUNT alongside group-by
      it('MIN/MAX/COUNT grouped by status return real extrema and counts', async () => {
        const rows = await runFilter({
          columns: ['status', 'amount'],
          aggregations: [
            { column: 'amount', function: 'MIN' },
            { column: 'amount', function: 'MAX' },
            { column: 'amount', function: 'COUNT' },
          ],
        });

        expect(rows).toHaveLength(2);
        const byStatus = new Map(rows.map(r => [String(r.status ?? r.STATUS ?? ''), r]));

        const active = byStatus.get('active')!;
        expect(active).toBeDefined();
        expect(Number(active['amount | MIN'])).toBeCloseTo(0, 5);
        expect(Number(active['amount | MAX'])).toBeCloseTo(50, 5);
        expect(Number(active['amount | COUNT'])).toBe(4);

        const inactive = byStatus.get('inactive')!;
        expect(inactive).toBeDefined();
        expect(Number(inactive['amount | MIN'])).toBeCloseTo(20, 5);
        expect(Number(inactive['amount | MAX'])).toBeCloseTo(40, 5);
        expect(Number(inactive['amount | COUNT'])).toBe(2);
      }, 60000);

      // Case 3 — STRING_AGG (LISTAGG in Snowflake). Order is not guaranteed without
      // ORDER BY so split + sort the result before asserting membership.
      it('STRING_AGG / LISTAGG (group by status) — assert sorted members, not raw order', async () => {
        const rows = await runFilter({
          columns: ['status', 'name'],
          aggregations: [{ column: 'name', function: 'STRING_AGG' }],
        });

        expect(rows).toHaveLength(2);
        const byStatus = new Map(rows.map(r => [String(r.status ?? r.STATUS ?? ''), r]));

        const splitSorted = (v: unknown): string[] =>
          String(v)
            .split(', ')
            .map(s => s.trim())
            .sort();

        const active = byStatus.get('active')!;
        expect(active).toBeDefined();
        // active rows: alpha, O'Brien, a\b, gamma (ids 1,3,5,6)
        expect(splitSorted(active['name | STRINGAGG'])).toEqual([
          "O'Brien",
          'a\\b',
          'alpha',
          'gamma',
        ]);

        const inactive = byStatus.get('inactive')!;
        expect(inactive).toBeDefined();
        // inactive rows: beta, 100% (ids 2,4)
        expect(splitSorted(inactive['name | STRINGAGG'])).toEqual(['100%', 'beta']);
      }, 60000);

      // Case 4 — all percentiles P25/P50/P75/P95 on amount (all 6 rows).
      // PERCENTILE_CONT uses exact linear interpolation:
      //   sorted amounts: [0, 10, 20, 30, 40, 50]
      //   P25=12.5, P50=25.0, P75=37.5, P95=47.5
      it('all percentiles (P25/P50/P75/P95) return exact PERCENTILE_CONT values and are monotonic', async () => {
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

        for (const p of [p25, p50, p75, p95]) {
          expect(Number.isFinite(p)).toBe(true);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(50);
        }

        // PERCENTILE_CONT is exact interpolation — assert precise values
        expect(p25).toBeCloseTo(12.5, 5);
        expect(p50).toBeCloseTo(25.0, 5);
        expect(p75).toBeCloseTo(37.5, 5);
        expect(p95).toBeCloseTo(47.5, 5);

        // Monotonicity must hold regardless
        expect(p25).toBeLessThanOrEqual(p50);
        expect(p50).toBeLessThanOrEqual(p75);
        expect(p75).toBeLessThanOrEqual(p95);
      }, 60000);

      // Case 5 — date-trunc MONTH + SUM on date_col.
      // The seed has dates spread across multiple months; row 5 is next year.
      // We only assert: correct number of distinct month buckets ≥ 3 (rows 3 and 4
      // are guaranteed to be in different months from today), and total SUM = 150.
      it('date-trunc MONTH + SUM on date_col — total SUM covers all 6 rows', async () => {
        const rows = await runFilter({
          columns: ['date_col', 'amount'],
          rowCount: true,
          dateTruncs: [{ column: 'date_col', unit: 'MONTH' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows.length).toBeGreaterThanOrEqual(3);
        const totalSum = rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);
        expect(totalSum).toBeCloseTo(150, 5);

        const totalRows = rows.reduce((acc, r) => acc + Number(r['Row Count']), 0);
        expect(totalRows).toBe(6);
      }, 60000);

      // Case 6 — date-trunc YEAR + SUM on date_col.
      // Rows 1,2,3,6 are within the past year; row 4 is ~13 months ago (prev yr);
      // row 5 is next year. So at least 3 distinct year buckets exist.
      // We only assert: total SUM = 150 (all rows covered), length ≥ 2.
      it('date-trunc YEAR + SUM on date_col — total SUM covers all 6 rows', async () => {
        const rows = await runFilter({
          columns: ['date_col', 'amount'],
          dateTruncs: [{ column: 'date_col', unit: 'YEAR' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows.length).toBeGreaterThanOrEqual(2);
        const totalSum = rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);
        expect(totalSum).toBeCloseTo(150, 5);
      }, 60000);

      // Case 7 — totals shape (metrics-only, no GROUP BY) → exactly ONE row.
      it('totals shape (metrics-only, no GROUP BY) → one row with correct grand totals', async () => {
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

      // Case 8 — aggregation respects a WHERE filter (totals-respect-filters guarantee).
      it('grand SUM with status=active filter covers only active rows (ids 1,3,5,6 → SUM=90)', async () => {
        const rows = await runFilter({
          columns: ['amount'],
          rowCount: true,
          filters: [{ column: 'status', operator: 'eq', value: 'active' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(Number(row['amount | SUM'])).toBeCloseTo(90, 5);
        expect(Number(row['Row Count'])).toBe(4);
      }, 60000);

      // Case 9 — ORDER BY aggregated alias (SUM desc) + limit 1 returns larger group.
      it('ORDER BY SUM desc + limit 1 returns the active group (larger sum 90 vs 60)', async () => {
        const rows = await runFilter({
          columns: ['status', 'amount'],
          aggregations: [{ column: 'amount', function: 'SUM' }],
          sort: [{ column: 'amount', direction: 'desc' }],
          limit: 1,
        });

        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(String(row.status ?? row.STATUS ?? '')).toBe('active');
        expect(Number(row['amount | SUM'])).toBeCloseTo(90, 5);
      }, 60000);

      // Case 10 — multi-dimension group-by (status + date-trunc MONTH).
      // Combined (status, month) pairs across 6 rows; total SUM must still be 150.
      it('multi-dimension group-by (status + date-trunc MONTH) — groups sum to 150', async () => {
        const rows = await runFilter({
          columns: ['status', 'date_col', 'amount'],
          dateTruncs: [{ column: 'date_col', unit: 'MONTH' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows.length).toBeGreaterThanOrEqual(3);
        const totalSum = rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);
        expect(totalSum).toBeCloseTo(150, 5);
      }, 60000);
    });
  }
);

// ---------------------------------------------------------------------------
// Blended pre-join SLICE — mirror of the BigQuery suite on REAL Snowflake.
// Proves a pre-join filter narrows a JOINED data mart inside its `<alias>_raw`
// CTE before the JOIN. Uses its OWN adapter + two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed:
//   orders(order_id, user_id, amount): (1,10,100) (2,20,200) (3,10,300) (4,30,400)
//   users(user_id, role, country):     (10,'admin','US') (20,'viewer','US') (30,'admin','DE')
//
// Subsidiaries are LEFT JOINed, so a slice alone narrows the users_raw CTE and
// NULLs out unmatched home rows; a post-join `role IS NOT NULL` eliminates them.

const BLEND_SLICE_SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeIfSnowflakeCredentials(
  'Blended pre-join slice narrows joined mart in *_raw CTE (real Snowflake)',
  () => {
    let adapter: SnowflakeApiAdapter;
    let ordersFQN: string;
    let usersFQN: string;

    const builder = new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer());

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
      // FQN passed VERBATIM — the Snowflake builder quotes identifiers itself,
      // so no extra backticks (those belong to BigQuery).
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
      // Snowflake renderer inlines all literals — params is empty, execute sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return (await adapter.executeQueryAndFetchAll(sql)) as Record<string, unknown>[];
    }

    function ids(rows: Record<string, unknown>[]): number[] {
      return rows.map(r => Number(r.order_id ?? r.ORDER_ID)).sort((a, b) => a - b);
    }

    // Read the role by key-presence, not `??`: a genuine NULL role (sliced-out row
    // after the LEFT JOIN) comes back as JS null, which `r.role ?? r.ROLE` would
    // wrongly collapse to undefined when the emitted key is lowercase `role`.
    function roleOf(r: Record<string, unknown>): unknown {
      return 'role' in r ? r.role : r.ROLE;
    }

    function roleByOrderId(rows: Record<string, unknown>[]): Record<number, unknown> {
      return Object.fromEntries(rows.map(r => [Number(r.order_id ?? r.ORDER_ID), roleOf(r)]));
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
      };
      adapter = new SnowflakeApiAdapter(credentials, config);

      // Establish the connection BEFORE any DDL try/catch (see the matrix block for why:
      // a swallowed connect() failure would leave the adapter in StateDisconnected).
      await adapter.checkAccess();

      ordersFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."orders_${BLEND_SLICE_SUFFIX}"`;
      usersFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."users_${BLEND_SLICE_SUFFIX}"`;

      // QUOTED lowercase columns: the blended builder quotes identifiers (lowercase),
      // so the seed DDL must use quoted lowercase column names to avoid a casing mismatch.
      await adapter.executeQuery(`
        CREATE TABLE ${ordersFQN} (
          "order_id" INTEGER,
          "user_id"  INTEGER,
          "amount"   NUMBER(10,2)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${ordersFQN} ("order_id", "user_id", "amount") VALUES
          (1, 10, 100),
          (2, 20, 200),
          (3, 10, 300),
          (4, 30, 400)
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${usersFQN} (
          "user_id" INTEGER,
          "role"    VARCHAR(50),
          "country" VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${usersFQN} ("user_id", "role", "country") VALUES
          (10, 'admin',  'US'),
          (20, 'viewer', 'US'),
          (30, 'admin',  'DE')
      `);
    }, 120000);

    afterAll(async () => {
      for (const fqn of [ordersFQN, usersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop blend table ${fqn}:`, error);
        }
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    it('BASELINE (no slice): every order carries its joined user role', async () => {
      const rows = await runBlend(blendContext());
      expect(ids(rows)).toEqual([1, 2, 3, 4]);
      const roleByOrder = roleByOrderId(rows);
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
      const roleByOrder = roleByOrderId(rows);
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
      expect(roleOf(rows[0])).toBe('viewer');
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended POST-JOIN aggregation — the canonical composite-key funnel on REAL
// Snowflake. This path (an outer GROUP BY over a joined/blended result) had only
// BigQuery real-warehouse coverage; Snowflake had none.
// Uses its OWN adapter + two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed (composite-key, pre-aggregated marts → 1-to-1 join, no row multiplication):
//   sessions(dt, channel, sessions): ('2024-01-01','paid',100) ('2024-01-01','organic',50)
//   events(dt, channel, events):     ('2024-01-01','paid',10)  ('2024-01-01','organic',5)
//
// Column `dt` (not `date`) dodges the DATE reserved word; the composite key stays
// two columns (dt, channel). Join on the COMPOSITE key (dt AND channel). The events
// CTE rolls up SUM by (dt,channel) — identity here, one row per key — then main
// LEFT JOINs it. The outer SELECT groups by channel with SUM(sessions) + SUM(events).
// If the join fanned out, sessions would be inflated; it must stay 100/50.

const BLEND_AGG_SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeIfSnowflakeCredentials(
  'Blended post-join aggregation — composite-key funnel (real Snowflake)',
  () => {
    let adapter: SnowflakeApiAdapter;
    let sessionsFQN: string;
    let eventsFQN: string;

    const builder = new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer());

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
      const { sql } = builder.buildBlendedQuery(context);
      return (await adapter.executeQueryAndFetchAll(sql)) as Record<string, unknown>[];
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
      };
      adapter = new SnowflakeApiAdapter(credentials, config);

      await adapter.checkAccess();

      sessionsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."sessions_${BLEND_AGG_SUFFIX}"`;
      eventsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."events_${BLEND_AGG_SUFFIX}"`;

      await adapter.executeQuery(`
        CREATE TABLE ${sessionsFQN} (
          "dt"       DATE,
          "channel"  VARCHAR(50),
          "sessions" INTEGER
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${sessionsFQN} ("dt", "channel", "sessions") VALUES
          ('2024-01-01'::DATE, 'paid',    100),
          ('2024-01-01'::DATE, 'organic', 50)
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${eventsFQN} (
          "dt"      DATE,
          "channel" VARCHAR(50),
          "events"  INTEGER
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${eventsFQN} ("dt", "channel", "events") VALUES
          ('2024-01-01'::DATE, 'paid',    10),
          ('2024-01-01'::DATE, 'organic', 5)
      `);
    }, 120000);

    afterAll(async () => {
      for (const fqn of [sessionsFQN, eventsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop blend-agg table ${fqn}:`, error);
        }
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    // The headline case: the composite-key join is 1-to-1, so the outer GROUP BY
    // yields exactly one row per channel with un-inflated SUM(sessions) and the
    // joined SUM(events). A fan-out would multiply sessions; the assertion would
    // then fail (which is the entire point of running this for real).
    it('composite-key (dt AND channel) post-join SUM stays 1-to-1: paid 100/10, organic 50/5', async () => {
      const rows = await runBlend(compositeContext());

      expect(rows).toHaveLength(2);
      const byChannel = new Map(rows.map(r => [String(r.channel ?? r.CHANNEL), r]));

      const paid = byChannel.get('paid')!;
      expect(paid).toBeDefined();
      expect(Number(paid['sessions | SUM'])).toBe(100);
      expect(Number(paid['events | SUM'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(organic).toBeDefined();
      expect(Number(organic['sessions | SUM'])).toBe(50);
      expect(Number(organic['events | SUM'])).toBe(5);
    }, 60000);

    // Same shape with a single-column join (channel only). The events table here
    // has one row per channel, so it is also 1-to-1 — proves the simpler join path
    // executes and aggregates correctly on real Snowflake too.
    it('single-key (channel only) post-join SUM also executes 1-to-1: paid 100/10, organic 50/5', async () => {
      const context = compositeContext();
      context.chains[0].relationship = eventsRelationship([
        { sourceFieldName: 'channel', targetFieldName: 'channel' },
      ]);

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const byChannel = new Map(rows.map(r => [String(r.channel ?? r.CHANNEL), r]));

      const paid = byChannel.get('paid')!;
      expect(Number(paid['sessions | SUM'])).toBe(100);
      expect(Number(paid['events | SUM'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(Number(organic['sessions | SUM'])).toBe(50);
      expect(Number(organic['events | SUM'])).toBe(5);
    }, 60000);
  }
);
