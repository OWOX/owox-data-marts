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
            '13:45:00'),
          -- Row 7: all-NULL row (except id). Proves negative operators keep NULL rows.
          (7, NULL, NULL, NULL, NULL, NULL, NULL)
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

    it('neq on status: not "active" → rows 2,4,7 (inactive + NULL row, null-inclusive)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'status', operator: 'neq', value: 'active' }],
      });
      expect(ids(rows)).toEqual(['2', '4', '7']);
    }, 30000);

    it('not_in on name: not in (alpha, beta) → rows 3,4,5,6,7 (null-inclusive: NULL row 7 kept)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_in', value: ['alpha', 'beta'] }],
      });
      expect(ids(rows)).toEqual(['3', '4', '5', '6', '7']);
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

    it('not_contains "eta" on name → rows 1,3,4,5,6,7 (all except beta + NULL row, null-inclusive)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_contains', value: 'eta' }],
      });
      expect(ids(rows)).toEqual(['1', '3', '4', '5', '6', '7']);
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

    it('not_regex: name NOT REGEXP_INSTR "^alp" → rows 2,3,4,5,6,7 (NULL row included, null-inclusive)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_regex', value: '^alp' }],
      });
      expect(ids(rows)).toEqual(['2', '3', '4', '5', '6', '7']);
    }, 30000);

    it('is_empty on name → row 7 (the NULL-seeded row; is_empty is null-inclusive)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_empty' }],
      });
      expect(ids(rows)).toEqual(['7']);
    }, 30000);

    it('is_not_empty: all 6 rows have non-empty names', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_not_empty' }],
      });
      expect(rows).toHaveLength(6);
    }, 30000);

    it('is_null on name → row 7 (the NULL-seeded row)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_null' }],
      });
      expect(ids(rows)).toEqual(['7']);
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

    it('sort by amount DESC + limit 2 → rows 7,5 (NULL amount first, then 50)', async () => {
      // Seed row 7 has amount=NULL. Snowflake treats NULL as highest, so DESC puts
      // NULLs first — the all-NULL row leads before amount 50 (id 5).
      const rows = await runFilter({
        sort: [{ column: 'amount', direction: 'desc' }],
        limit: 2,
      });
      expect(rows.map(r => String(r.id ?? r.ID ?? ''))).toEqual(['7', '5']);
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
      // Totals under a metric filter, on the FLAT (non-blended) path. A Totals query has no GROUP BY,
      // so the report's HAVING travels as a `groupRestriction` and the builder joins the groups that
      // survive it. Two things are proven here that no unit test can: that this engine ACCEPTS the
      // emitted SQL — the restriction subquery selects the same columns off the same table as the outer
      // query, which made every outer reference ambiguous until the keys were given private aliases —
      // and that the number is restricted rather than merely filtered.
      it('fan-out: Totals are restricted to the groups the metric filter keeps (real Snowflake)', async () => {
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

        // 3 groups: active, inactive, and the NULL-status row 7.
        expect(rows).toHaveLength(3);
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

        // 3 groups: active, inactive, and the NULL-status row 7.
        expect(rows).toHaveLength(3);
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

        // 3 groups: active, inactive, and the NULL-status row 7.
        expect(rows).toHaveLength(3);
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

      // Case 4 — all percentiles P25/P50/P75/P95 on amount (6 non-NULL amounts;
      // row 7's NULL amount is ignored by PERCENTILE_CONT).
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
      it('date-trunc MONTH + SUM on date_col — total SUM covers non-NULL amounts; Row Count covers all 7 rows', async () => {
        const rows = await runFilter({
          columns: ['date_col', 'amount'],
          rowCount: true,
          dateTruncs: [{ column: 'date_col', unit: 'MONTH' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows.length).toBeGreaterThanOrEqual(3);
        // NULL amount on row 7 does not change SUM; Number(null)→0 for that bucket.
        const totalSum = rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);
        expect(totalSum).toBeCloseTo(150, 5);

        // Includes the NULL-date bucket for row 7.
        const totalRows = rows.reduce((acc, r) => acc + Number(r['Row Count']), 0);
        expect(totalRows).toBe(7);
      }, 60000);

      // Case 6 — date-trunc YEAR + SUM on date_col.
      // Rows 1,2,3,6 are within the past year; row 4 is ~13 months ago (prev yr);
      // row 5 is next year. So at least 3 distinct year buckets exist.
      // We only assert: total SUM = 150 (non-NULL amounts), length ≥ 2.
      it('date-trunc YEAR + SUM on date_col — total SUM covers non-NULL amounts', async () => {
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
        // SUM ignores NULL amount on row 7; COUNT/Row Count include the all-NULL row.
        expect(Number(row['amount | SUM'])).toBeCloseTo(150, 5);
        expect(Number(row['id | COUNTUNIQUE'])).toBe(7);
        expect(Number(row['Row Count'])).toBe(7);
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

      // Case 9 — ORDER BY aggregated alias (SUM desc) with the NULL-status bucket.
      // Three groups: active SUM=90, inactive SUM=60, NULL-status SUM=NULL.
      // Snowflake DESC treats NULL as highest, so the NULL-status group leads.
      it('ORDER BY SUM desc: NULL-status group first, then active (90), then inactive (60)', async () => {
        const rows = await runFilter({
          columns: ['status', 'amount'],
          aggregations: [{ column: 'amount', function: 'SUM' }],
          sort: [{ column: 'amount', direction: 'desc' }],
        });

        expect(rows).toHaveLength(3);
        const statusOf = (r: Record<string, unknown>): unknown =>
          'status' in r ? r.status : r.STATUS;

        // 1) NULL-status bucket (SUM of NULL amount → NULL) leads under DESC NULLS FIRST
        expect(statusOf(rows[0])).toBeNull();
        expect(rows[0]['amount | SUM']).toBeNull();
        // 2) active SUM=90 is the highest non-NULL aggregate
        expect(String(statusOf(rows[1]))).toBe('active');
        expect(Number(rows[1]['amount | SUM'])).toBeCloseTo(90, 5);
        // 3) inactive SUM=60
        expect(String(statusOf(rows[2]))).toBe('inactive');
        expect(Number(rows[2]['amount | SUM'])).toBeCloseTo(60, 5);
      }, 60000);

      // Case 10 — multi-dimension group-by (status + date-trunc MONTH).
      // Combined (status, month) pairs across 7 rows (incl. NULL bucket); total SUM must still be 150.
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
      // 'events' is a joined (blended) column with a genuine pre-join SUM
      // roll-up (not an ANY_VALUE passthrough), so the report-level SUM routes through
      // the value sleeve — which needs the field index to resolve the owner chain/column.
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'events', aliasPath: 'events', originalFieldName: 'events', type: 'NUMBER' },
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

// ---------------------------------------------------------------------------
// Blended COUNT_DISTINCT through a bridge — "metric sleeve" fix (, real
// Snowflake). This proves the N-hop NESTED-bridge variant: a 2-hop chain
// events -> users -> organizations, where `organizations` is a CHILD of
// `users` (org_id lives on users), NOT a sibling of it. Main = events
// (bridge/fact grain); `users` is a ROOT chain off main (dimension: country);
// `organizations` hangs off users (metric: distinct org count). Because the
// metric column is two hops from main, the sleeve must re-join BOTH raw CTEs
// (Task 3's N-hop ancestor closure) — that closure is exactly what this case
// exercises against real Snowflake.
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

const BRIDGE_SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeIfSnowflakeCredentials(
  'Blended COUNT_DISTINCT through a bridge — metric sleeve (real Snowflake)',
  () => {
    let adapter: SnowflakeApiAdapter;
    let eventsFQN: string;
    let usersFQN: string;
    let organizationsFQN: string;

    const builder = new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer());

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
      // Snowflake renderer inlines all literals — params is empty, execute sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return (await adapter.executeQueryAndFetchAll(sql)) as Record<string, unknown>[];
    }

    // Read the country by key-presence, not `??`: mirrors the file's convention
    // for blended output columns (see `roleOf` above) — defensive against
    // Snowflake's unquoted-identifier uppercase folding.
    function countryOf(r: Record<string, unknown>): unknown {
      return 'users__country' in r ? r.users__country : r.USERS__COUNTRY;
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

      eventsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."bridge_events_${BRIDGE_SUFFIX}"`;
      usersFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."bridge_users_${BRIDGE_SUFFIX}"`;
      organizationsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."bridge_organizations_${BRIDGE_SUFFIX}"`;

      // QUOTED lowercase columns: the blended builder quotes identifiers, so the
      // seed DDL must use quoted columns to avoid a casing mismatch.
      await adapter.executeQuery(`
        CREATE TABLE ${eventsFQN} (
          "event_id" VARCHAR(10),
          "user_id"  VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${eventsFQN} ("event_id", "user_id") VALUES
          ('e1','u1'), ('e2','u1'), ('e3','u2'),
          ('e4','u3'), ('e5','u3'),
          ('e6','u4'), ('e7','u4'), ('e8','u5')
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${usersFQN} (
          "userId"  VARCHAR(10),
          "country" VARCHAR(10),
          "org_id"  VARCHAR(10)
        )
      `);
      // u1 genuinely belongs to TWO orgs (o1 AND o4) — the fan-out that breaks the
      // pre-fix dedup-then-read mechanism (see block comment above).
      await adapter.executeQuery(`
        INSERT INTO ${usersFQN} ("userId", "country", "org_id") VALUES
          ('u1','US','o1'), ('u1','US','o4'),
          ('u2','US','o5'),
          ('u3','DE','o2'),
          ('u4','UA','o3'),
          ('u5','PL','o3')
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${organizationsFQN} (
          "orgId" VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${organizationsFQN} ("orgId") VALUES
          ('o1'), ('o2'), ('o3'), ('o4'), ('o5')
      `);
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, usersFQN, organizationsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop bridge table ${fqn}:`, error);
        }
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    it('fan-out: joined COUNT DISTINCT is correct through a bridge (sleeve): US=3, DE=1, UA=1, PL=1', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(4);
      const byCountry = new Map(
        rows.map(r => [String(countryOf(r)), Number(r['organizations__orgId | COUNTUNIQUE'])])
      );

      // THE headline case (under-counted pre-fix): u1 genuinely belongs to TWO
      // orgs (o1, o4); u2 belongs to a third (o5) — US must show all 3, not the
      // pre-fix ANY_VALUE-collapsed 2.
      expect(byCountry.get('US')).toBe(3);
      expect(byCountry.get('DE')).toBe(1);
      expect(byCountry.get('UA')).toBe(1);
      expect(byCountry.get('PL')).toBe(1);
    }, 60000);

    it('grand total (no grouping) also stays correct through the bridge: 5 distinct orgs, not the pre-fix 4', async () => {
      const context = bridgeContext();
      context.columns = ['organizations__orgId']; // dimensionless: no report GROUP BY
      const rows = await runBlend(context);

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['organizations__orgId | COUNTUNIQUE'])).toBe(5);
    }, 60000);

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
      // Snowflake is the one dialect that quotes EVERY identifier, so the CTE name is quoted too.
      expect(sql).toContain('"sleeve_users_counts" AS (');
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
// real Snowflake). Mirrors bigquery.integration.ts's C2.4 bridge SUM/AVG case
// exactly (same topology, seed, and ground truth). This is the critical
// cross-dialect proof for Snowflake specifically: Snowflake's own docs claim
// a window ORDER BY integer literal is interpreted as a CONSTANT, not an
// ordinal reference (see the base class's `buildRowSurrogate` docstring) — this
// exercises that claim against a REAL account, proving
// `ROW_NUMBER() OVER (ORDER BY 1)` actually compiles and assigns distinct ids.
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

const SUMAVG_BRIDGE_SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeIfSnowflakeCredentials(
  'Blended SUM/AVG through a bridge — value sleeve (5, real Snowflake)',
  () => {
    let adapter: SnowflakeApiAdapter;
    let itemsFQN: string;
    let ordersFQN: string;
    let productsFQN: string;

    const builder = new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer());

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
      // Snowflake renderer inlines all literals — params is empty, execute sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return (await adapter.executeQueryAndFetchAll(sql)) as Record<string, unknown>[];
    }

    // Read the category by key-presence, not `??`: defensive against Snowflake's
    // unquoted-identifier uppercase folding (mirrors `countryOf` above).
    function categoryOf(r: Record<string, unknown>): unknown {
      return 'products__category' in r ? r.products__category : r.PRODUCTS__CATEGORY;
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

      itemsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."sumavg_items_${SUMAVG_BRIDGE_SUFFIX}"`;
      ordersFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."sumavg_orders_${SUMAVG_BRIDGE_SUFFIX}"`;
      productsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."sumavg_products_${SUMAVG_BRIDGE_SUFFIX}"`;

      // QUOTED lowercase columns: the blended builder quotes identifiers, so the
      // seed DDL must use quoted columns to avoid a casing mismatch.
      await adapter.executeQuery(`
        CREATE TABLE ${itemsFQN} (
          "itemId"    VARCHAR(10),
          "orderId"   VARCHAR(10),
          "productId" VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${itemsFQN} ("itemId", "orderId", "productId") VALUES
          ('i1','o1','pA'), ('i2','o1','pC'),
          ('i3','o2','pA'), ('i4','o2','pB'),
          ('i5','o3','pC')
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${ordersFQN} (
          "orderId" VARCHAR(10),
          "revenue" NUMBER(10,2)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${ordersFQN} ("orderId", "revenue") VALUES
          ('o1', 100), ('o2', 50), ('o3', 30)
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${productsFQN} (
          "productId" VARCHAR(10),
          "category"  VARCHAR(20)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${productsFQN} ("productId", "category") VALUES
          ('pA','Supplements'), ('pB','Supplements'), ('pC','Gear')
      `);
    }, 180000);

    afterAll(async () => {
      for (const fqn of [itemsFQN, ordersFQN, productsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop value-sleeve bridge table ${fqn}:`, error);
        }
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    it('fan-out: joined SUM through the bridge is set-based correct: Supplements=150 (not naive 200), Gear=130', async () => {
      const rows = await runBlend(bridgeContext('SUM'));

      expect(rows).toHaveLength(2);
      const byCategory = new Map(
        rows.map(r => [String(categoryOf(r)), Number(r['orders__revenue | SUM'])])
      );

      expect(byCategory.get('Supplements')).toBe(150);
      expect(byCategory.get('Gear')).toBe(130);
    }, 60000);

    it('fan-out: joined AVG through the bridge is set-based correct: Supplements=75 (not naive avg-of-3-rows 66.67), Gear=65', async () => {
      const rows = await runBlend(bridgeContext('AVG'));

      expect(rows).toHaveLength(2);
      const byCategory = new Map(
        rows.map(r => [String(categoryOf(r)), Number(r['orders__revenue | AVG'])])
      );

      expect(byCategory.get('Supplements')).toBe(75);
      expect(byCategory.get('Gear')).toBe(65);
    }, 60000);

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
        rows.map(r => [String(categoryOf(r)), Number(r['orders__revenue | SUM'])])
      );
      const avgs = new Map(
        rows.map(r => [String(categoryOf(r)), Number(r['orders__revenue | AVG'])])
      );

      expect(sums.get('Supplements')).toBe(150);
      expect(sums.get('Gear')).toBe(130);
      expect(avgs.get('Supplements')).toBe(75);
      expect(avgs.get('Gear')).toBe(65);
    }, 60000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM through a bridge — no-PK synthetic surrogate (5, real
// Snowflake). Mirrors bigquery.integration.ts's C2.4 no-PK surrogate case.
// Dimensionless grand total: main = items (bridge fact), one chain = orders
// (metric: SUM amount, no report GROUP BY) — exercises the sleeve's CROSS
// JOIN / ungrouped shape and the surrogate on real Snowflake.
//
// Seed — two DIFFERENT orders, A and B, both worth exactly $50; A is reached
// through the bridge TWICE (fanned), B once:
//   orders(orderId, amount): A=50, B=50
//   items(itemId, orderId):  i1->A, i2->A (A fans out), i3->B
// Ground truth: 50 + 50 = 100 (naive additive = 150; dedup-by-value-alone = 50).

const SUMAVG_NOPK_SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeIfSnowflakeCredentials(
  'Blended SUM through a bridge — no-PK synthetic surrogate (5, real Snowflake)',
  () => {
    let adapter: SnowflakeApiAdapter;
    let itemsFQN: string;
    let ordersFQN: string;

    const builder = new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer());

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
      return (await adapter.executeQueryAndFetchAll(sql)) as Record<string, unknown>[];
    }

    function amountOf(r: Record<string, unknown>): unknown {
      return 'orders__amount | SUM' in r ? r['orders__amount | SUM'] : r['ORDERS__AMOUNT | SUM'];
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

      itemsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."nopk_items_${SUMAVG_NOPK_SUFFIX}"`;
      ordersFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."nopk_orders_${SUMAVG_NOPK_SUFFIX}"`;

      await adapter.executeQuery(`
        CREATE TABLE ${itemsFQN} (
          "itemId"  VARCHAR(10),
          "orderId" VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${itemsFQN} ("itemId", "orderId") VALUES
          ('i1','A'), ('i2','A'), ('i3','B')
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${ordersFQN} (
          "orderId" VARCHAR(10),
          "amount"  NUMBER(10,2)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${ordersFQN} ("orderId", "amount") VALUES ('A', 50), ('B', 50)
      `);
    }, 180000);

    afterAll(async () => {
      for (const fqn of [itemsFQN, ordersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop no-PK surrogate table ${fqn}:`, error);
        }
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    it('fan-out: no-PK synthetic surrogate: two distinct $50 orders (one fanned) sum to 100, not naive 150 or dedup-by-value 50', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(1);
      expect(Number(amountOf(rows[0]))).toBe(100);
    }, 60000);
  }
);

// ---------------------------------------------------------------------------
// sleeve honours post-join FILTERS (C1) and the outer dimension GRAIN
// for a FANNING blended dimension (C2), real Snowflake. Mirrors
// bigquery.integration.ts's " sleeve honours post-join filters +
// fanning blended dimension" case exactly (same topology, seed, and ground
// truth). Both defects made the sleeve silently disagree with the outer
// query; prior fixtures were all 1-row-per-key with no filter, which hid them.
//
// Topology: main = events; two sibling chains off main —
//   labels  (main.dimKey = labels.dimKey)  — dimension, roll-up = STRING_AGG
//   orders  (main.orderId = orders.orderId) — metric owner (SUM + COUNT_DISTINCT)
//
// The `labels` chain FANS: dimKey k1 owns TWO label rows (red, blue), so its
// dedup CTE rolls them up (LISTAGG → 'blue, red' — one value per dimKey).
// The report groups by that rolled-up label. Pre-C2 the sleeve projected the
// RAW label ('red'/'blue'), which never equalled the outer roll-up ('blue, red')
// → NULL-safe join-back never matched → NULL metric. The fix builds the sleeve's
// dimension from the SAME dedup-CTE ref the outer GROUP BY uses.
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

const R1_SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeIfSnowflakeCredentials(
  'sleeve honours post-join filters + fanning blended dimension (real Snowflake)',
  () => {
    let adapter: SnowflakeApiAdapter;
    let eventsFQN: string;
    let labelsFQN: string;
    let ordersFQN: string;

    const builder = new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer());

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

    // dimension: labels__label (STRING_AGG/LISTAGG roll-up — the fanning dimension);
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
                // STRING_AGG (→ LISTAGG on Snowflake): the fanning dimension rolls up to
                // 'blue, red' per dimKey — the NON-identity roll-up that exposes C2.
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
      // Snowflake renderer inlines all literals — params is empty, execute sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return (await adapter.executeQueryAndFetchAll(sql)) as Record<string, unknown>[];
    }

    // Read the rolled-up label by key-presence, not `??`: defensive against Snowflake's
    // unquoted-identifier uppercase folding (mirrors `countryOf`/`categoryOf` above).
    function labelOf(r: Record<string, unknown>): unknown {
      return 'labels__label' in r ? r.labels__label : r.LABELS__LABEL;
    }
    function revenueSumOf(r: Record<string, unknown>): unknown {
      return 'orders__revenue | SUM' in r ? r['orders__revenue | SUM'] : r['ORDERS__REVENUE | SUM'];
    }
    function orderCountDistinctOf(r: Record<string, unknown>): unknown {
      return 'orders__orderId | COUNTUNIQUE' in r
        ? r['orders__orderId | COUNTUNIQUE']
        : r['ORDERS__ORDERID | COUNTUNIQUE'];
    }

    // The rolled-up label ('blue, red') order is not guaranteed by LISTAGG, so identify the
    // fanning bucket as the one that is NOT the lone 'green' row.
    function fanningRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => String(labelOf(r)) !== 'green')!;
    }
    function greenRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => String(labelOf(r)) === 'green')!;
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

      eventsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."r1_events_${R1_SUFFIX}"`;
      labelsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."r1_labels_${R1_SUFFIX}"`;
      ordersFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."r1_orders_${R1_SUFFIX}"`;

      // QUOTED columns (case preserved): the blended builder quotes identifiers, so the
      // seed DDL must use quoted columns to avoid a casing mismatch.
      await adapter.executeQuery(`
        CREATE TABLE ${eventsFQN} (
          "eventId" VARCHAR(10),
          "dimKey"  VARCHAR(10),
          "orderId" VARCHAR(10),
          "country" VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${eventsFQN} ("eventId", "dimKey", "orderId", "country") VALUES
          ('ev1','k1','o1','US'), ('ev2','k1','o2','DE'), ('ev3','k2','o3','US')
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${labelsFQN} (
          "dimKey" VARCHAR(10),
          "label"  VARCHAR(10)
        )
      `);
      // k1 owns TWO labels (red, blue) — the fan-out that makes the dedup roll-up non-identity.
      await adapter.executeQuery(`
        INSERT INTO ${labelsFQN} ("dimKey", "label") VALUES
          ('k1','red'), ('k1','blue'), ('k2','green')
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${ordersFQN} (
          "orderId" VARCHAR(10),
          "revenue" NUMBER(10,2)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${ordersFQN} ("orderId", "revenue") VALUES
          ('o1', 100), ('o2', 50), ('o3', 30)
      `);
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, labelsFQN, ordersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop R1 fixture table ${fqn}:`, error);
        }
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    it('a FANNING blended dimension returns correct NON-NULL per-group SUM and COUNT_DISTINCT (blue,red=150/2, green=30/1)', async () => {
      const rows = await runBlend(fanningContext());

      expect(rows).toHaveLength(2);
      const fan = fanningRow(rows); // the rolled-up 'blue, red' bucket (k1)
      const green = greenRow(rows);

      // The rolled-up label bucket actually combines red + blue (proves it is the roll-up, not
      // a single raw value).
      expect(String(labelOf(fan))).toContain('red');
      expect(String(labelOf(fan))).toContain('blue');

      // C2: both metrics land on the rolled-up bucket (NULL pre-fix, because the sleeve
      // projected the raw label which never matched the outer 'blue, red').
      expect(Number(revenueSumOf(fan))).toBe(150);
      expect(Number(orderCountDistinctOf(fan))).toBe(2);
      expect(Number(revenueSumOf(green))).toBe(30);
      expect(Number(orderCountDistinctOf(green))).toBe(1);
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
      expect(Number(revenueSumOf(fan))).toBe(100);
      expect(Number(orderCountDistinctOf(fan))).toBe(1);
      // 'green' (k2, order o3=$30, event ev3 is US) is untouched by the filter.
      expect(Number(revenueSumOf(green))).toBe(30);
      expect(Number(orderCountDistinctOf(green))).toBe(1);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM through a non-identity pre-join aggregate — value sleeve (
// R2/C3, funnel, real Snowflake). Mirrors bigquery.integration.ts's
// "Blended SUM through a non-identity pre-join aggregate — value sleeve"
// case exactly (same topology, seed, and ground truth). Proves the R2 fix: a
// blended field whose OWN pre-join `aggregateFunction` is a real aggregate
// (here COUNT_DISTINCT, not the raw ANY_VALUE passthrough every other
// fixture uses) must have its post-join value sleeve read the OWNER's OWN
// dedup CTE column (one value per pre-join GROUP KEY), not the raw column
// keyed by the per-raw-row surrogate. Pre-R2 this would have summed RAW hit
// ids — on this STRING id shape that is a hard type error on most engines
// (you can't SUM a string); on a numeric id it would silently sum the wrong
// (raw, pre-dedup) numbers.
//
// Topology: main = sessions (session_id, campaign). ONE chain off main: hits
// (session_id, hit_id — hit_id is STRING, the real-world shape), blended
// field `hits__hit_id` with pre-join aggregateFunction COUNT_DISTINCT — i.e.
// the dedup CTE computes `COUNT(DISTINCT hit_id)` PER session (the join key),
// not a raw passthrough.
//
// Seed (hit_id repeats WITHIN a session — e.g. a retried/duplicate event — so
// the pre-join COUNT_DISTINCT genuinely dedupes something):
//   sessions(session_id, campaign): s1=A, s2=A, s3=B
//   hits(session_id, hit_id):
//     s1: h1, h1, h2   (distinct hit ids = 2)
//     s2: h3, h4, h5   (distinct hit ids = 3)
//     s3: h6, h6       (distinct hit ids = 1)
//
// Ground truth (hand-computed): SUM, per campaign, of each session's OWN
// distinct-hit count — NOT a sum of raw hit rows/ids:
//   campaign A: sessions {s1, s2} -> 2 + 3 = 5
//   campaign B: session  {s3}     -> 1

const FUNNEL_SUFFIX = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describeIfSnowflakeCredentials(
  'Blended SUM through a non-identity pre-join aggregate — value sleeve (/C3, funnel, real Snowflake)',
  () => {
    let adapter: SnowflakeApiAdapter;
    let sessionsFQN: string;
    let hitsFQN: string;

    const builder = new SnowflakeBlendedQueryBuilder(new SnowflakeClauseRenderer());

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
      // Snowflake renderer inlines all literals — params is empty, execute sql directly.
      const { sql } = builder.buildBlendedQuery(context);
      return (await adapter.executeQueryAndFetchAll(sql)) as Record<string, unknown>[];
    }

    function campaignOf(r: Record<string, unknown>): unknown {
      return 'campaign' in r ? r.campaign : r.CAMPAIGN;
    }
    function hitSumOf(r: Record<string, unknown>): unknown {
      return 'hits__hit_id | SUM' in r ? r['hits__hit_id | SUM'] : r['HITS__HIT_ID | SUM'];
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

      sessionsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."funnel_sessions_${FUNNEL_SUFFIX}"`;
      hitsFQN = `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."funnel_hits_${FUNNEL_SUFFIX}"`;

      await adapter.executeQuery(`
        CREATE TABLE ${sessionsFQN} (
          "session_id" VARCHAR(10),
          "campaign"   VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${sessionsFQN} ("session_id", "campaign") VALUES
          ('s1','A'), ('s2','A'), ('s3','B')
      `);

      await adapter.executeQuery(`
        CREATE TABLE ${hitsFQN} (
          "session_id" VARCHAR(10),
          "hit_id"     VARCHAR(10)
        )
      `);
      await adapter.executeQuery(`
        INSERT INTO ${hitsFQN} ("session_id", "hit_id") VALUES
          ('s1','h1'), ('s1','h1'), ('s1','h2'),
          ('s2','h3'), ('s2','h4'), ('s2','h5'),
          ('s3','h6'), ('s3','h6')
      `);
    }, 180000);

    afterAll(async () => {
      for (const fqn of [sessionsFQN, hitsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop funnel table ${fqn}:`, error);
        }
      }
      try {
        await adapter.destroy();
      } catch (error) {
        console.warn('Failed to destroy Snowflake adapter:', error);
      }
    }, 60000);

    it('/ joined SUM over a non-identity pre-join COUNT_DISTINCT is the sum of PER-SESSION distinct hit counts: A=5, B=1 (not a raw-id sum/type error)', async () => {
      const context = funnelContext();
      const { sql } = builder.buildBlendedQuery(context);

      // The sleeve reads the dedup CTE's own aggregated column, keyed by the pre-join
      // group key — never the raw `hits_raw`.`hit_id` column (which would either type-error
      // on this STRING id or silently sum the wrong, pre-dedup numbers). Snowflake's builder
      // ALWAYS quotes identifiers (unlike BigQuery's conditional quoting — see
      // SnowflakeBlendedQueryBuilder#quoteIdentifier), so the reference is `"hits"."hits__hit_id"`.
      expect(sql).toContain('"hits"."hits__hit_id"');
      expect(sql).not.toContain('"hits_raw"."hit_id"');

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const byCampaign = new Map(rows.map(r => [String(campaignOf(r)), Number(hitSumOf(r))]));

      expect(byCampaign.get('A')).toBe(5);
      expect(byCampaign.get('B')).toBe(1);
    }, 120000);
  }
);
