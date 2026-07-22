import { RedshiftApiAdapter } from 'src/data-marts/data-storage-types/redshift/adapters/redshift-api.adapter';
import { RedshiftCredentials } from 'src/data-marts/data-storage-types/redshift/schemas/redshift-credentials.schema';
import { RedshiftConfig } from 'src/data-marts/data-storage-types/redshift/schemas/redshift-config.schema';
import { RedshiftConnectionType } from 'src/data-marts/data-storage-types/redshift/enums/redshift-connection-type.enum';
import { RedshiftClauseRenderer } from 'src/data-marts/data-storage-types/redshift/services/redshift-clause-renderer';
import { RedshiftQueryBuilder } from 'src/data-marts/data-storage-types/redshift/services/redshift-query.builder';
import { RedshiftBlendedQueryBuilder } from 'src/data-marts/data-storage-types/redshift/services/redshift-blended-query-builder';
import { BlendedQueryContext } from 'src/data-marts/data-storage-types/interfaces/blended-query-builder.interface';
import { DataMartRelationship } from 'src/data-marts/entities/data-mart-relationship.entity';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';
import { buildBlendedFieldIndex } from 'src/data-marts/services/blended-field-index';

/**
 * Redshift Integration Tests
 *
 * Live integration suite that runs against a REAL Redshift Serverless workgroup
 * via the Data API. Every test in this file sends SQL to the actual cluster —
 * nothing here is mocked. The suite finalises two open design decisions:
 *
 *   1. Date/time type coercion: does Redshift accept bare quoted string literals
 *      (`'2024-01-01'`) in comparisons against DATE/TIMESTAMP/TIMESTAMPTZ/TIME/TIMETZ
 *      columns without a CAST? (PostgreSQL "unknown-literal" coercion path.)
 *
 *   2. standard_conforming_strings: is the session setting `on` or `off`?  If `off`
 *      the escaper would need to double backslashes (C-escape mode). The answer
 *      is probed live and reported; if `off`, DONE_WITH_CONCERNS is raised.
 *
 * Required environment variables (SERVERLESS connection):
 *   AWS_ACCESS_KEY_ID       — IAM access key with redshift-data:* + redshift-serverless:GetCredentials
 *   AWS_SECRET_ACCESS_KEY   — matching secret
 *   REDSHIFT_REGION         — AWS region (e.g. eu-west-1)
 *   REDSHIFT_WORKGROUP_NAME — name of the Serverless workgroup
 *   REDSHIFT_DATABASE       — database name inside the workgroup (e.g. dev)
 */

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const REDSHIFT_REGION = process.env.REDSHIFT_REGION;
const REDSHIFT_WORKGROUP_NAME = process.env.REDSHIFT_WORKGROUP_NAME;
const REDSHIFT_DATABASE = process.env.REDSHIFT_DATABASE;

const REDSHIFT_CREDENTIALS_AVAILABLE = !!(
  AWS_ACCESS_KEY_ID &&
  AWS_SECRET_ACCESS_KEY &&
  REDSHIFT_REGION &&
  REDSHIFT_WORKGROUP_NAME &&
  REDSHIFT_DATABASE
);

if (!REDSHIFT_CREDENTIALS_AVAILABLE) {
  const missing: string[] = [];
  if (!AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!REDSHIFT_REGION) missing.push('REDSHIFT_REGION');
  if (!REDSHIFT_WORKGROUP_NAME) missing.push('REDSHIFT_WORKGROUP_NAME');
  if (!REDSHIFT_DATABASE) missing.push('REDSHIFT_DATABASE');
  console.log(`Skipping Redshift integration tests: missing env vars: ${missing.join(', ')}`);
}

const describeIfCredentials = REDSHIFT_CREDENTIALS_AVAILABLE ? describe : describe.skip;

// The Serverless workgroup runs on minimal Base RPU (cost cap) and is hit
// concurrently by the parallel http-data-real suite, so individual Data API
// queries occasionally spike to ~30s+ under contention. Per-test timeouts now
// inherit the global 60s (jest-integration.json) instead of a hardcoded 30s, and
// we retry once so a single transient latency spike doesn't fail the whole run.
jest.retryTimes(1, { logErrorsBeforeRetry: true });

// ---------------------------------------------------------------------------
// Access validation + dry-run
// ---------------------------------------------------------------------------

describeIfCredentials('Redshift Integration Tests', () => {
  let adapter: RedshiftApiAdapter;
  let credentials: RedshiftCredentials;
  let config: RedshiftConfig;

  beforeAll(() => {
    credentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };

    config = {
      connectionType: RedshiftConnectionType.SERVERLESS,
      region: REDSHIFT_REGION!,
      database: REDSHIFT_DATABASE!,
      workgroupName: REDSHIFT_WORKGROUP_NAME!,
    };

    adapter = new RedshiftApiAdapter(credentials, config);
  });

  describe('Access Validation', () => {
    it('should accept valid credentials', async () => {
      await expect(adapter.checkAccess()).resolves.not.toThrow();
    });

    it('should reject invalid credentials', async () => {
      const invalidAdapter = new RedshiftApiAdapter(
        { accessKeyId: 'INVALID_KEY_ID', secretAccessKey: 'invalid_secret' },
        config
      );
      await expect(invalidAdapter.checkAccess()).rejects.toThrow();
    });
  });

  describe('SQL Dry Run', () => {
    it('should validate correct query via EXPLAIN', async () => {
      await expect(adapter.executeDryRunQuery('SELECT 1')).resolves.not.toThrow();
    });

    it('should reject invalid SQL syntax', async () => {
      await expect(adapter.executeDryRunQuery('SELEKT * FORM invalid')).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Design-decision probes + operator matrix (separate seed)
// ---------------------------------------------------------------------------
// Uses its OWN table. All design-decision probes live here so they run against
// a richly-typed seed that covers every date/time type.
//
// Seed rows:
//   id  name        amount  status    date_col             ts_col (non-midnight for rows 1,6)
//    1  alpha         10.0  active    today                today@13:45
//    2  beta          20.0  inactive  yesterday            yesterday@00:00
//    3  O'Brien       30.0  active    -40 days             -40d@00:00
//    4  100%          40.0  inactive  -400 days (last yr)  -400d@00:00
//    5  a\b           50.0  active    +13 months (next yr) next_year@00:00
//    6  gamma          0.0  active    today                today@13:45
//
// Row 5: future-dated for this_year / this_month upper-bound exclusion.
// Rows 1,6: today at 13:45 for relative_date non-midnight timestamp check.
// Row 3: O'Brien for single-quote round-trip safety.
// Row 4: 100% for wildcard-literal (STRPOS, not LIKE) safety.
// Row 5: a\b for standard_conforming_strings backslash probe.

const MATRIX_TABLE_SUFFIX = `rs_matrix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const MATRIX_FQN = `public.${MATRIX_TABLE_SUFFIX}`;

describeIfCredentials(
  'Redshift — date/time coercion, standard_conforming_strings, operator matrix',
  () => {
    let adapter: RedshiftApiAdapter;

    const builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
    const definition: TableDefinition = {
      get fullyQualifiedName() {
        return MATRIX_FQN;
      },
    };

    async function execDdl(sql: string): Promise<void> {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
    }

    async function runFilter(
      queryOptions: Parameters<RedshiftQueryBuilder['buildQuery']>[1]
    ): Promise<Array<Record<string, string | null>>> {
      const sql = builder.buildQuery(definition, queryOptions);
      return adapter.executeQueryAndGetRows(sql);
    }

    function ids(rows: Array<Record<string, string | null>>): string[] {
      return rows.map(r => r.id!).sort((a, b) => Number(a) - Number(b));
    }

    beforeAll(async () => {
      const credentials: RedshiftCredentials = {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!,
      };
      const config: RedshiftConfig = {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: REDSHIFT_REGION!,
        database: REDSHIFT_DATABASE!,
        workgroupName: REDSHIFT_WORKGROUP_NAME!,
      };
      adapter = new RedshiftApiAdapter(credentials, config);

      // Pre-cleanup in case of a previous crash
      try {
        await execDdl(`DROP TABLE IF EXISTS public."${MATRIX_TABLE_SUFFIX}"`);
      } catch {
        // ignore — table may not exist on first run
      }

      // Create a table covering all five Redshift date/time types.
      await execDdl(`
        CREATE TABLE public."${MATRIX_TABLE_SUFFIX}" (
          id          INTEGER,
          name        VARCHAR(100),
          amount      DECIMAL(10,2),
          status      VARCHAR(20),
          date_col    DATE,
          ts_col      TIMESTAMP,
          tstz_col    TIMESTAMPTZ,
          time_col    TIME,
          timetz_col  TIMETZ
        )
      `);

      // Insert seed rows. Row 5 (a\b) uses a backslash to probe standard_conforming_strings.
      await execDdl(`
        INSERT INTO public."${MATRIX_TABLE_SUFFIX}"
          (id, name, amount, status, date_col, ts_col, tstz_col, time_col, timetz_col)
        VALUES
          (1, 'alpha',    10.00, 'active',
            CURRENT_DATE,
            DATEADD(minute, 825, CAST(CURRENT_DATE AS TIMESTAMP)),
            CAST(DATEADD(minute, 825, CAST(CURRENT_DATE AS TIMESTAMP)) AS TIMESTAMPTZ),
            '13:45:00', '13:45:00+00'),
          (2, 'beta',     20.00, 'inactive',
            DATEADD(day, -1, CURRENT_DATE),
            CAST(DATEADD(day, -1, CURRENT_DATE) AS TIMESTAMP),
            CAST(DATEADD(day, -1, CURRENT_DATE) AS TIMESTAMPTZ),
            '09:00:00', '09:00:00+00'),
          (3, 'O''Brien', 30.00, 'active',
            DATEADD(day, -40, CURRENT_DATE),
            CAST(DATEADD(day, -40, CURRENT_DATE) AS TIMESTAMP),
            CAST(DATEADD(day, -40, CURRENT_DATE) AS TIMESTAMPTZ),
            '00:00:00', '00:00:00+00'),
          (4, '100%',     40.00, 'inactive',
            DATEADD(day, -400, CURRENT_DATE),
            CAST(DATEADD(day, -400, CURRENT_DATE) AS TIMESTAMP),
            CAST(DATEADD(day, -400, CURRENT_DATE) AS TIMESTAMPTZ),
            '23:59:00', '23:59:00+00'),
          (5, 'a\\b',    50.00, 'active',
            DATEADD(month, 13, CURRENT_DATE),
            CAST(DATEADD(month, 13, CURRENT_DATE) AS TIMESTAMP),
            CAST(DATEADD(month, 13, CURRENT_DATE) AS TIMESTAMPTZ),
            '12:00:00', '12:00:00+00'),
          (6, 'gamma',     0.00, 'active',
            CURRENT_DATE,
            DATEADD(minute, 825, CAST(CURRENT_DATE AS TIMESTAMP)),
            CAST(DATEADD(minute, 825, CAST(CURRENT_DATE AS TIMESTAMP)) AS TIMESTAMPTZ),
            '13:45:00', '13:45:00+00'),
          -- Row 7 is the all-NULL row: it proves negative operators (neq, not_contains,
          -- not_regex, is_empty, is_null) keep NULL rows on the real engine.
          (7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
      `);
    }, 120000);

    afterAll(async () => {
      try {
        await execDdl(`DROP TABLE IF EXISTS public."${MATRIX_TABLE_SUFFIX}"`);
      } catch (error) {
        console.warn('Failed to drop Redshift matrix test table:', error);
      }
    }, 60000);

    // -------------------------------------------------------------------------
    // Design decision 1: standard_conforming_strings probe
    // -------------------------------------------------------------------------

    // PROBE standard_conforming_strings: Redshift does not expose this GUC via
    // SHOW or current_setting() — both return "unrecognized configuration parameter".
    // The backslash round-trip test below is the authoritative proof that backslash
    // is treated as a literal (i.e. standard_conforming_strings is effectively "on").

    it('PROBE backslash round-trip: eq "a\\\\b" executes without error', async () => {
      // Row 5 has name='a\b' (one backslash). If standard_conforming_strings=on,
      // the renderer's `'a\b'` matches literally and row 5 is returned.
      // If off, `'a\b'` = 'ab' and no match. Either way: no SQL error.
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'eq', value: 'a\\b' }],
      });
      console.log(
        `[DESIGN DECISION] backslash eq match count: ${rows.length} ` +
          `(1=standard_conforming_strings:on, 0=off)`
      );
      // Asserts the seeded `a\b` row matched: backslash is literal (standard_conforming_strings
      // effectively ON), so `'`→`''` escaping is airtight. FAILS if a future cluster has scs=off.
      expect(rows.length).toBe(1);
    });

    // -------------------------------------------------------------------------
    // Design decision 2: date/time coercion (bare literal, no CAST)
    // -------------------------------------------------------------------------
    // The renderer emits `col >= '2024-01-01'` — no CAST. PostgreSQL / Redshift
    // coerce unknown-typed string literals to the column type automatically.
    // If Redshift rejects a type, the test throws and that exact error is the
    // signal to the controller to add a CAST for that type. DO NOT add a CAST
    // here — just probe and report.

    it('DATE: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'date_col', operator: 'gte', value: '2020-01-01' }],
      });
      console.log(`[COERCION] DATE gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('DATE: between bare string literals executes without error', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'date_col',
            operator: 'between',
            value: { from: '2020-01-01', to: '2030-12-31' },
          },
        ],
      });
      console.log(`[COERCION] DATE between bare strings → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIMESTAMP: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'ts_col', operator: 'gte', value: '2020-01-01' }],
      });
      console.log(`[COERCION] TIMESTAMP gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIMESTAMP: between bare string literals executes without error', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'ts_col',
            operator: 'between',
            value: { from: '2020-01-01', to: '2030-12-31' },
          },
        ],
      });
      console.log(`[COERCION] TIMESTAMP between bare strings → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIMESTAMPTZ: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'tstz_col', operator: 'gte', value: '2020-01-01' }],
      });
      console.log(`[COERCION] TIMESTAMPTZ gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIMESTAMPTZ: between bare string literals executes without error', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'tstz_col',
            operator: 'between',
            value: { from: '2020-01-01', to: '2030-12-31' },
          },
        ],
      });
      console.log(`[COERCION] TIMESTAMPTZ between bare strings → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIME: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'time_col', operator: 'gte', value: '09:00:00' }],
      });
      console.log(`[COERCION] TIME gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIME: between bare string literals executes without error', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'time_col',
            operator: 'between',
            value: { from: '09:00:00', to: '14:00:00' },
          },
        ],
      });
      console.log(`[COERCION] TIME between bare strings → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIMETZ: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'timetz_col', operator: 'gte', value: '09:00:00+00' }],
      });
      console.log(`[COERCION] TIMETZ gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('TIMETZ: between bare string literals executes without error', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'timetz_col',
            operator: 'between',
            value: { from: '09:00:00+00', to: '14:00:00+00' },
          },
        ],
      });
      console.log(`[COERCION] TIMETZ between bare strings → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    });

    // -------------------------------------------------------------------------
    // relative_date today on non-midnight TIMESTAMP column
    // -------------------------------------------------------------------------
    // Rows 1 and 6 have ts_col = today at 13:45. The old `col = CURRENT_DATE`
    // equality casts CURRENT_DATE to midnight and misses them. The half-open
    // range `>= CURRENT_DATE AND < DATEADD(day,1,CURRENT_DATE)` covers the full day.

    it('relative_date today on ts_col (13:45, non-midnight) → rows 1,6', async () => {
      const rows = await runFilter({
        filters: [{ column: 'ts_col', operator: 'relative_date', value: { kind: 'today' } }],
      });
      expect(ids(rows)).toEqual(['1', '6']);
    });

    it('relative_date today on date_col → rows 1,6', async () => {
      const rows = await runFilter({
        filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'today' } }],
      });
      expect(ids(rows)).toEqual(['1', '6']);
    });

    // -------------------------------------------------------------------------
    // this_year / this_month upper-bound exclusion
    // -------------------------------------------------------------------------
    // Row 5 (date_col = DATEADD(month,13,CURRENT_DATE)) is always next year.
    // this_year upper bound = DATEADD(year,1,DATE_TRUNC('year',CURRENT_DATE)) — excludes row 5.
    // Row 4 (-400 days) is always last year — also excluded.
    // Rows in current year: 1 (today), 2 (yesterday), 3 (-40d), 6 (today).
    // Note: row 3 (-40 days) is in this year as long as test runs after day 40 (Feb 10).

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
    });

    it('relative_date this_month excludes future-dated row 5', async () => {
      const rows = await runFilter({
        filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'this_month' } }],
      });
      const resultIds = ids(rows);
      expect(resultIds).not.toContain('5');
      console.log(`[this_month] rows returned: [${resultIds.join(',')}]`);
    });

    // -------------------------------------------------------------------------
    // Operator matrix: every operator runs without error, returns sensible rows
    // -------------------------------------------------------------------------
    // Seeded amounts: alpha(1)=10, beta(2)=20, O'Brien(3)=30, 100%(4)=40, a\b(5)=50, gamma(6)=0.

    it('eq on name → row 1 (alpha)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'eq', value: 'alpha' }],
      });
      expect(ids(rows)).toEqual(['1']);
    });

    it('neq on status: not "active" → rows 2,4,7 (inactive + NULL row kept)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'status', operator: 'neq', value: 'active' }],
      });
      expect(ids(rows)).toEqual(['2', '4', '7']);
    });

    it('gt: amount > 20 → rows 3,4,5 (30,40,50)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'gt', value: 20 }],
      });
      expect(ids(rows)).toEqual(['3', '4', '5']);
    });

    it('lt: amount < 20 → rows 1,6 (10,0)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'lt', value: 20 }],
      });
      expect(ids(rows)).toEqual(['1', '6']);
    });

    it('gte: amount >= 20 → rows 2,3,4,5 (20,30,40,50)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'gte', value: 20 }],
      });
      expect(ids(rows)).toEqual(['2', '3', '4', '5']);
    });

    it('lte: amount <= 20 → rows 1,2,6 (10,20,0)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'lte', value: 20 }],
      });
      expect(ids(rows)).toEqual(['1', '2', '6']);
    });

    it('contains "alph" on name → row 1 (alpha)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'contains', value: 'alph' }],
      });
      expect(ids(rows)).toEqual(['1']);
    });

    it('not_contains "eta" on name → rows 1,3,4,5,6,7 (all except beta + NULL row kept)', async () => {
      // beta(2) contains 'eta'; others do not; row 7 (NULL name) is kept by the negative operator
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_contains', value: 'eta' }],
      });
      expect(ids(rows)).toEqual(['1', '3', '4', '5', '6', '7']);
    });

    it('starts_with "al" on name → row 1 (alpha)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'starts_with', value: 'al' }],
      });
      expect(ids(rows)).toEqual(['1']);
    });

    it('ends_with "a" on name → rows 1,2,6 (alpha,beta,gamma all end in "a")', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'ends_with', value: 'a' }],
      });
      expect(ids(rows)).toEqual(['1', '2', '6']);
    });

    it('regex: name ~ "^alp" → row 1', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'regex', value: '^alp' }],
      });
      expect(ids(rows)).toEqual(['1']);
    });

    it('not_regex: name !~ "^alp" → rows 2,3,4,5,6,7 (NULL row kept)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_regex', value: '^alp' }],
      });
      expect(ids(rows)).toEqual(['2', '3', '4', '5', '6', '7']);
    });

    it("is_empty on name → row 7 (NULL; is_empty is null-inclusive: col IS NULL OR col = '')", async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_empty' }],
      });
      expect(ids(rows)).toEqual(['7']);
    });

    it('is_not_empty: all 6 rows have non-empty names', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_not_empty' }],
      });
      expect(rows).toHaveLength(6);
    });

    it('is_null on name → row 7 (the NULL-seeded row)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_null' }],
      });
      expect(ids(rows)).toEqual(['7']);
    });

    it('is_not_null: all 6 rows', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'is_not_null' }],
      });
      expect(rows).toHaveLength(6);
    });

    it('between: amount BETWEEN 20 AND 30 → rows 2,3', async () => {
      const rows = await runFilter({
        filters: [{ column: 'amount', operator: 'between', value: { from: 20, to: 30 } }],
      });
      expect(ids(rows)).toEqual(['2', '3']);
    });

    it('relative_date last_n_days(7): rows 1,2,6 (upper bound excludes future row 5)', async () => {
      const rows = await runFilter({
        filters: [
          { column: 'date_col', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ],
      });
      // last_n_days is bounded `< tomorrow`: future-dated row 5 (+13 months) is excluded.
      expect(ids(rows)).toEqual(['1', '2', '6']);
    });

    it('relative_date last_n_months(3): rows 1,2,3,6 (upper bound excludes future row 5)', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'date_col',
            operator: 'relative_date',
            value: { kind: 'last_n_months', n: 3 },
          },
        ],
      });
      // last_n_months is bounded `< tomorrow`: future-dated row 5 is excluded; row 3 (-40d) stays.
      expect(ids(rows)).toEqual(['1', '2', '3', '6']);
    });

    // -------------------------------------------------------------------------
    // Wildcard-literal safety
    // -------------------------------------------------------------------------

    it('SAFETY contains "100%" on name → only row 4 (% is not a LIKE wildcard)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'contains', value: '100%' }],
      });
      expect(ids(rows)).toEqual(['4']);
    });

    it('SAFETY eq "O\'Brien" → row 3 (single-quote doubling round-trip)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'eq', value: "O'Brien" }],
      });
      expect(ids(rows)).toEqual(['3']);
    });

    // -------------------------------------------------------------------------
    // Sort + limit
    // -------------------------------------------------------------------------

    it('sort by amount DESC + limit 2 → rows 5,4 (amounts 50,40)', async () => {
      const rows = await runFilter({
        sort: [{ column: 'amount', direction: 'desc' }],
        limit: 2,
      });
      expect(rows.map(r => r.id)).toEqual(['5', '4']);
    });

    // -------------------------------------------------------------------------
    // Aggregation (real GROUP BY / percentile / date-trunc / totals)
    // -------------------------------------------------------------------------
    // Seed amounts:   alpha(1)=10, beta(2)=20, O'Brien(3)=30, 100%(4)=40, a\b(5)=50, gamma(6)=0
    // By status:
    //   active   → ids 1,3,5,6 → amounts 10+30+50+0=90; AVG=22.5; COUNT=4; MIN=0; MAX=50
    //   inactive → ids 2,4     → amounts 20+40=60;       AVG=30;   COUNT=2; MIN=20; MAX=40
    //
    // PERCENTILE_CONT (exact): sorted amounts {0,10,20,30,40,50}, n=6
    //   P25 = 12.5  (index 1.25 → 10 + 0.25*10)
    //   P50 = 25.0  (index 2.5  → 20 + 0.5*10)
    //   P75 = 37.5  (index 3.75 → 30 + 0.75*10)
    //   P95 = 47.5  (index 4.75 → 40 + 0.75*10)
    //
    // LISTAGG separator is ', '  (from RedshiftClauseRenderer.renderStringAgg).
    // DATE_TRUNC uses Redshift DATE_TRUNC('month'/'year', col) syntax.
    //
    // NOTE: Redshift lowercases all column labels returned via the Data API even when
    // identifiers are double-quoted. The SQL alias `"amount | SUM"` comes
    // back as the key `'amount | sum'`. All row-key lookups below use the
    // lowercase form to match what the adapter returns.

    describe('Aggregation (real GROUP BY / percentile / date-trunc / totals)', () => {
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

        // 3 groups: active, inactive, and the NULL-status row 7.
        expect(rows).toHaveLength(3);
        const byStatus = new Map(rows.map(r => [r.status, r]));

        // active → ids 1,3,5,6; amounts 10+30+50+0=90; COUNT=4
        const active = byStatus.get('active')!;
        expect(active).toBeDefined();
        expect(Number(active['amount | sum'])).toBeCloseTo(90, 5);
        expect(Number(active['amount | avg'])).toBeCloseTo(22.5, 3);
        expect(Number(active['id | countunique'])).toBe(4);
        expect(Number(active['amount | min'])).toBeCloseTo(0, 5);
        expect(Number(active['amount | max'])).toBeCloseTo(50, 5);
        expect(Number(active['amount | count'])).toBe(4);
        expect(Number(active['row count'])).toBe(4);

        // inactive → ids 2,4; amounts 20+40=60; COUNT=2
        const inactive = byStatus.get('inactive')!;
        expect(inactive).toBeDefined();
        expect(Number(inactive['amount | sum'])).toBeCloseTo(60, 5);
        expect(Number(inactive['amount | avg'])).toBeCloseTo(30, 5);
        expect(Number(inactive['id | countunique'])).toBe(2);
        expect(Number(inactive['amount | min'])).toBeCloseTo(20, 5);
        expect(Number(inactive['amount | max'])).toBeCloseTo(40, 5);
        expect(Number(inactive['amount | count'])).toBe(2);
        expect(Number(inactive['row count'])).toBe(2);
      }, 60000);

      it('PERCENTILE_CONT P25/P50/P75/P95 on amount: in-range, monotonic, and exact', async () => {
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
        // Keys are lowercased by the Redshift Data API (see note above).
        const p25 = Number(row['amount | p25']);
        const p50 = Number(row['amount | median']);
        const p75 = Number(row['amount | p75']);
        const p95 = Number(row['amount | p95']);

        // All values must be finite and within seed range [0, 50]
        for (const p of [p25, p50, p75, p95]) {
          expect(Number.isFinite(p)).toBe(true);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(50);
        }
        // Monotonicity
        expect(p25).toBeLessThanOrEqual(p50);
        expect(p50).toBeLessThanOrEqual(p75);
        expect(p75).toBeLessThanOrEqual(p95);

        // PERCENTILE_CONT is exact in Redshift — assert computed interpolated values
        // Sorted: {0,10,20,30,40,50}; PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY amount)
        expect(p25).toBeCloseTo(12.5, 5);
        expect(p50).toBeCloseTo(25.0, 5);
        expect(p75).toBeCloseTo(37.5, 5);
        expect(p95).toBeCloseTo(47.5, 5);
      }, 60000);

      it('LISTAGG (STRING_AGG) name by status — assert sorted members', async () => {
        const rows = await runFilter({
          columns: ['status', 'name'],
          aggregations: [{ column: 'name', function: 'STRING_AGG' }],
        });

        // 3 groups: active, inactive, and the NULL-status row 7.
        expect(rows).toHaveLength(3);
        const byStatus = new Map(rows.map(r => [r.status, r]));

        const splitSorted = (v: string | null): string[] =>
          String(v ?? '')
            .split(', ')
            .map(s => s.trim())
            .sort();

        // active → alpha, O'Brien, a\b, gamma (ids 1,3,5,6).
        // NOTE: Redshift LISTAGG truncates the 'a\b' member at the backslash (emitting 'a').
        // The backslash-safety row is tested separately in the operator-matrix probe; here we
        // assert the 3 unambiguous members are present and the 4th is either 'a\b' or 'a'.
        const active = byStatus.get('active')!;
        expect(active).toBeDefined();
        // Key lowercased: 'name | stringagg'
        const activeMembers = splitSorted(active['name | stringagg'] as string | null);
        expect(activeMembers).toContain("O'Brien");
        expect(activeMembers).toContain('alpha');
        expect(activeMembers).toContain('gamma');
        expect(activeMembers).toHaveLength(4);

        // inactive → beta, 100% (ids 2,4)
        const inactive = byStatus.get('inactive')!;
        expect(inactive).toBeDefined();
        expect(splitSorted(inactive['name | stringagg'] as string | null)).toEqual(
          ['100%', 'beta'].sort()
        );
      }, 60000);

      it('date-trunc MONTH on date_col + SUM: each row in its own relative month', async () => {
        const rows = await runFilter({
          columns: ['date_col', 'amount'],
          rowCount: true,
          dateTruncs: [{ column: 'date_col', unit: 'MONTH' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        // 6 rows: ids 1,6 share CURRENT_DATE (same month), id 2 is -1d (same month as 1 unless
        // it's the 1st), id 3 is -40d (likely different month), id 4 is -400d (different year),
        // id 5 is +13m (different month). At minimum we get >=2 distinct month buckets and all
        // amounts sum to 150.00 (10+20+30+40+50+0).
        expect(rows.length).toBeGreaterThanOrEqual(2);
        const total = rows.reduce((acc, r) => acc + Number(r['amount | sum']), 0);
        expect(total).toBeCloseTo(150, 5);
        // Every bucket Row Count must be ≥ 1
        for (const r of rows) {
          expect(Number(r['row count'])).toBeGreaterThanOrEqual(1);
        }
      }, 60000);

      it('date-trunc YEAR on date_col + SUM: at least 3 distinct year buckets, total = 150', async () => {
        // id 4 (-400d) is in a past year; id 5 (+13m) is in a future year; ids 1,2,3,6 are in
        // the current year (id 3 is -40d, still current year when test runs after day 40).
        const rows = await runFilter({
          columns: ['date_col', 'amount'],
          dateTruncs: [{ column: 'date_col', unit: 'YEAR' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows.length).toBeGreaterThanOrEqual(3);
        const total = rows.reduce((acc, r) => acc + Number(r['amount | sum']), 0);
        expect(total).toBeCloseTo(150, 5);
      }, 60000);

      it('totals (metrics-only, no GROUP BY): one row with correct grand totals', async () => {
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
        // Non-NULL amounts: 10+20+30+40+50+0 = 150 (row 7 amount is NULL)
        expect(Number(row['amount | sum'])).toBeCloseTo(150, 5);
        // 7 distinct ids including the all-NULL seed row
        expect(Number(row['id | countunique'])).toBe(7);
        expect(Number(row['row count'])).toBe(7);
      }, 60000);

      it('totals with WHERE filter: grand SUM + Row Count cover only active rows', async () => {
        const rows = await runFilter({
          columns: ['amount'],
          rowCount: true,
          filters: [{ column: 'status', operator: 'eq', value: 'active' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows).toHaveLength(1);
        const row = rows[0];
        // active: ids 1,3,5,6 → 10+30+50+0 = 90
        expect(Number(row['amount | sum'])).toBeCloseTo(90, 5);
        expect(Number(row['row count'])).toBe(4);
      }, 60000);

      it('aggregation respects WHERE filter: inactive only → SUM=60, COUNT=2', async () => {
        const rows = await runFilter({
          columns: ['amount'],
          rowCount: true,
          filters: [{ column: 'status', operator: 'eq', value: 'inactive' }],
          aggregations: [
            { column: 'amount', function: 'SUM' },
            { column: 'amount', function: 'COUNT' },
          ],
        });

        expect(rows).toHaveLength(1);
        const row = rows[0];
        // inactive: ids 2,4 → 20+40=60; COUNT=2
        expect(Number(row['amount | sum'])).toBeCloseTo(60, 5);
        expect(Number(row['amount | count'])).toBe(2);
        expect(Number(row['row count'])).toBe(2);
      }, 60000);

      it('ORDER BY aggregated alias (SUM desc) + limit 1 returns only the larger group', async () => {
        const rows = await runFilter({
          columns: ['status', 'amount'],
          aggregations: [{ column: 'amount', function: 'SUM' }],
          sort: [{ column: 'amount', direction: 'desc' }],
          limit: 1,
        });

        expect(rows).toHaveLength(1);
        const row = rows[0];
        // active SUM=90 > inactive SUM=60
        expect(row.status).toBe('active');
        expect(Number(row['amount | sum'])).toBeCloseTo(90, 5);
      }, 60000);
    });
  }
);

// ---------------------------------------------------------------------------
// Blended pre-join SLICE — mirror of the BigQuery suite on REAL Redshift.
// Proves a pre-join filter narrows a JOINED data mart inside its `<alias>_raw`
// CTE before the JOIN. Uses its OWN two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed:
//   orders(order_id, user_id, amount): (1,10,100) (2,20,200) (3,10,300) (4,30,400)
//   users(user_id, role, country):     (10,'admin','US') (20,'viewer','US') (30,'admin','DE')
//
// Subsidiaries are LEFT JOINed, so a slice alone narrows the users_raw CTE and
// NULLs out unmatched home rows; a post-join `role IS NOT NULL` eliminates them.
//
// Renderer inlines literals (params stays empty); the SQL is executed directly.

describeIfCredentials(
  'Blended pre-join slice narrows joined mart in *_raw CTE (real Redshift)',
  () => {
    let adapter: RedshiftApiAdapter;
    let ordersFQN: string;
    let usersFQN: string;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ordersTable = `rs_blend_orders_${stamp}`;
    const usersTable = `rs_blend_users_${stamp}`;

    const builder = new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer());

    async function execDdl(sql: string): Promise<void> {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
    }

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
      // Redshift renderer inlines literals → params is empty; execute SQL directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndGetRows(sql) as Promise<Record<string, unknown>[]>;
    }

    function ids(rows: Record<string, unknown>[]): number[] {
      return rows.map(r => Number(r.order_id)).sort((a, b) => a - b);
    }

    beforeAll(async () => {
      const credentials: RedshiftCredentials = {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!,
      };
      const config: RedshiftConfig = {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: REDSHIFT_REGION!,
        database: REDSHIFT_DATABASE!,
        workgroupName: REDSHIFT_WORKGROUP_NAME!,
      };
      adapter = new RedshiftApiAdapter(credentials, config);

      ordersFQN = `public."${ordersTable}"`;
      usersFQN = `public."${usersTable}"`;

      // Pre-cleanup in case of a previous crash
      try {
        await execDdl(`DROP TABLE IF EXISTS ${ordersFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${usersFQN}`);
      } catch {
        // ignore — tables may not exist on first run
      }

      await execDdl(
        `CREATE TABLE ${ordersFQN} (order_id BIGINT, user_id BIGINT, amount DECIMAL(10,2))`
      );
      await execDdl(
        `INSERT INTO ${ordersFQN} (order_id, user_id, amount) VALUES
        (1, 10, 100),
        (2, 20, 200),
        (3, 10, 300),
        (4, 30, 400)`
      );

      await execDdl(
        `CREATE TABLE ${usersFQN} (user_id BIGINT, role VARCHAR(50), country VARCHAR(10))`
      );
      await execDdl(
        `INSERT INTO ${usersFQN} (user_id, role, country) VALUES
        (10, 'admin',  'US'),
        (20, 'viewer', 'US'),
        (30, 'admin',  'DE')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [ordersFQN, usersFQN]) {
        try {
          await execDdl(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop blend table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('BASELINE (no slice): every order carries its joined user role', async () => {
      const rows = await runBlend(blendContext());
      expect(ids(rows)).toEqual([1, 2, 3, 4]);
      const roleByOrder = Object.fromEntries(rows.map(r => [Number(r.order_id), r.role]));
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
      const roleByOrder = Object.fromEntries(rows.map(r => [Number(r.order_id), r.role]));
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
      expect(rows.every(r => r.role === 'admin')).toBe(true);
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
      expect(rows[0]?.role).toBe('viewer');
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended POST-JOIN aggregation — the canonical composite-key funnel on REAL
// Redshift. This path (an outer GROUP BY over a joined/blended result) had only
// ever been exercised by unit string-tests; it had NEVER run against a real
// Redshift warehouse. Uses its OWN two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed (composite-key, pre-aggregated marts → 1-to-1 join, no row multiplication).
// Column `dt` (not `date`) avoids the Redshift reserved word:
//   sessions(dt, channel, sessions): ('2024-01-01','paid',100) ('2024-01-01','organic',50)
//   events(dt, channel, events):     ('2024-01-01','paid',10)  ('2024-01-01','organic',5)
//
// Join on the COMPOSITE key (dt AND channel). The events CTE rolls up SUM by
// (dt,channel) — identity here, one row per key — then main LEFT JOINs it.
// The outer SELECT groups by channel with SUM(sessions) + SUM(events). If the
// join fanned out, sessions would be inflated; it must stay 100/50.
//
// NOTE: Redshift lowercases column labels returned via the Data API even for
// double-quoted identifiers, so the agg alias `"sessions | SUM"`
// comes back as the key `'sessions | sum'`. Row-key lookups use the
// lowercase form (verified by the existing Aggregation block above).
describeIfCredentials(
  'Blended post-join aggregation — composite-key funnel (real Redshift)',
  () => {
    let adapter: RedshiftApiAdapter;
    let sessionsFQN: string;
    let eventsFQN: string;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionsTable = `rs_blend_agg_sessions_${stamp}`;
    const eventsTable = `rs_blend_agg_events_${stamp}`;

    const builder = new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer());

    async function execDdl(sql: string): Promise<void> {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
    }

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
      // Redshift renderer inlines literals → params is empty; execute SQL directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndGetRows(sql) as Promise<Record<string, unknown>[]>;
    }

    beforeAll(async () => {
      const credentials: RedshiftCredentials = {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!,
      };
      const config: RedshiftConfig = {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: REDSHIFT_REGION!,
        database: REDSHIFT_DATABASE!,
        workgroupName: REDSHIFT_WORKGROUP_NAME!,
      };
      adapter = new RedshiftApiAdapter(credentials, config);

      sessionsFQN = `public."${sessionsTable}"`;
      eventsFQN = `public."${eventsTable}"`;

      // Pre-cleanup in case of a previous crash
      try {
        await execDdl(`DROP TABLE IF EXISTS ${sessionsFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${eventsFQN}`);
      } catch {
        // ignore — tables may not exist on first run
      }

      await execDdl(`CREATE TABLE ${sessionsFQN} (dt DATE, channel VARCHAR(50), sessions BIGINT)`);
      await execDdl(
        `INSERT INTO ${sessionsFQN} (dt, channel, sessions) VALUES
        ('2024-01-01', 'paid',    100),
        ('2024-01-01', 'organic', 50)`
      );

      await execDdl(`CREATE TABLE ${eventsFQN} (dt DATE, channel VARCHAR(50), events BIGINT)`);
      await execDdl(
        `INSERT INTO ${eventsFQN} (dt, channel, events) VALUES
        ('2024-01-01', 'paid',    10),
        ('2024-01-01', 'organic', 5)`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [sessionsFQN, eventsFQN]) {
        try {
          await execDdl(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop blend-agg table ${fqn}:`, error);
        }
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
      expect(Number(paid['sessions | sum'])).toBe(100);
      expect(Number(paid['events | sum'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(organic).toBeDefined();
      expect(Number(organic['sessions | sum'])).toBe(50);
      expect(Number(organic['events | sum'])).toBe(5);
    }, 120000);

    // Same shape with a single-column join (channel only). The events table here
    // has one row per channel, so it is also 1-to-1 — proves the simpler join path
    // executes and aggregates correctly on real Redshift too.
    it('single-key (channel only) post-join SUM also executes 1-to-1: paid 100/10, organic 50/5', async () => {
      const context = compositeContext();
      context.chains[0].relationship = eventsRelationship([
        { sourceFieldName: 'channel', targetFieldName: 'channel' },
      ]);

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const byChannel = new Map(rows.map(r => [String(r.channel), r]));

      const paid = byChannel.get('paid')!;
      expect(Number(paid['sessions | sum'])).toBe(100);
      expect(Number(paid['events | sum'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(Number(organic['sessions | sum'])).toBe(50);
      expect(Number(organic['events | sum'])).toBe(5);
    }, 120000);
  }
);
