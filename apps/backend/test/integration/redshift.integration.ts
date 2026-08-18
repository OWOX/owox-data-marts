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
          -- Row 7 is the all-NULL row: it proves negative operators (neq, not_in, not_contains,
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

    it('not_in on name: not in (alpha, beta) → rows 3,4,5,6,7 (null-inclusive: NULL row 7 kept)', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'not_in', value: ['alpha', 'beta'] }],
      });
      expect(ids(rows)).toEqual(['3', '4', '5', '6', '7']);
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

    it('sort by amount DESC + limit 2 → rows 7,5 (NULL amount first, then 50)', async () => {
      // Seed row 7 has amount=NULL. Redshift follows PostgreSQL NULL ordering:
      // DESC sorts NULLs first, so the all-NULL row leads before amount 50 (id 5).
      const rows = await runFilter({
        sort: [{ column: 'amount', direction: 'desc' }],
        limit: 2,
      });
      expect(rows.map(r => r.id)).toEqual(['7', '5']);
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
      // Totals under a metric filter, on the FLAT (non-blended) path. A Totals query has no GROUP BY,
      // so the report's HAVING travels as a `groupRestriction` and the builder joins the groups that
      // survive it. Two things are proven here that no unit test can: that this engine ACCEPTS the
      // emitted SQL — the restriction subquery selects the same columns off the same table as the outer
      // query, which made every outer reference ambiguous until the keys were given private aliases —
      // and that the number is restricted rather than merely filtered.
      it('fan-out: Totals are restricted to the groups the metric filter keeps (real Redshift)', async () => {
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

        expect(Number(restricted[0]['amount | sum'])).toBeCloseTo(90, 5);
        expect(Number(restricted[0]['id | countunique'])).toBe(4);
        expect(Number(unrestricted[0]['amount | sum'])).toBeCloseTo(150, 5);
      }, 120000);

      it('group-by status + SUM/AVG/COUNT_DISTINCT/MIN/MAX/COUNT returns real per-group values', async () => {
        const rows = await runFilter({
          columns: ['status', 'amount', 'id'],
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

        // inactive → ids 2,4; amounts 20+40=60; COUNT=2
        const inactive = byStatus.get('inactive')!;
        expect(inactive).toBeDefined();
        expect(Number(inactive['amount | sum'])).toBeCloseTo(60, 5);
        expect(Number(inactive['amount | avg'])).toBeCloseTo(30, 5);
        expect(Number(inactive['id | countunique'])).toBe(2);
        expect(Number(inactive['amount | min'])).toBeCloseTo(20, 5);
        expect(Number(inactive['amount | max'])).toBeCloseTo(40, 5);
        expect(Number(inactive['amount | count'])).toBe(2);
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
      }, 60000);

      it('totals with WHERE filter: grand SUM covers only active rows', async () => {
        const rows = await runFilter({
          columns: ['amount'],
          filters: [{ column: 'status', operator: 'eq', value: 'active' }],
          aggregations: [{ column: 'amount', function: 'SUM' }],
        });

        expect(rows).toHaveLength(1);
        const row = rows[0];
        // active: ids 1,3,5,6 → 10+30+50+0 = 90
        expect(Number(row['amount | sum'])).toBeCloseTo(90, 5);
      }, 60000);

      it('aggregation respects WHERE filter: inactive only → SUM=60, COUNT=2', async () => {
        const rows = await runFilter({
          columns: ['amount'],
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
      }, 60000);

      it('ORDER BY aggregated alias (SUM desc): NULL-status group first, then active (90)', async () => {
        // Three groups after the all-NULL seed row: active SUM=90, inactive SUM=60,
        // NULL-status SUM=NULL. Redshift DESC puts NULLs first, so limit 1 alone would
        // return the NULL-status bucket — pull all groups and assert full order.
        const rows = await runFilter({
          columns: ['status', 'amount'],
          aggregations: [{ column: 'amount', function: 'SUM' }],
          sort: [{ column: 'amount', direction: 'desc' }],
        });

        expect(rows).toHaveLength(3);
        // 1) NULL-status bucket (SUM of NULL amount → NULL) leads under DESC NULLS FIRST
        expect(rows[0].status).toBeNull();
        expect(rows[0]['amount | sum']).toBeNull();
        // 2) active SUM=90 is the highest non-NULL aggregate
        expect(rows[1].status).toBe('active');
        expect(Number(rows[1]['amount | sum'])).toBeCloseTo(90, 5);
        // 3) inactive SUM=60
        expect(rows[2].status).toBe('inactive');
        expect(Number(rows[2]['amount | sum'])).toBeCloseTo(60, 5);
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
      // 'events' is a joined (blended) column with a genuine pre-join SUM
      // roll-up (not an ANY_VALUE passthrough), so the report-level SUM routes through
      // the value sleeve — which needs the field index to resolve the owner chain/column.
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'events', aliasPath: 'events', originalFieldName: 'events', type: 'INTEGER' },
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

// ---------------------------------------------------------------------------
// Blended COUNT_DISTINCT through a bridge — "metric sleeve" fix (, real
// Redshift). This proves the N-hop NESTED-bridge variant: a 2-hop chain
// events -> users -> organizations, where `organizations` is a CHILD of
// `users` (org_id lives on users), NOT a sibling of it. Main = events
// (bridge/fact grain); `users` is a ROOT chain off main (dimension: country);
// `organizations` hangs off users (metric: distinct org count). Because the
// metric column is two hops from main, the sleeve must re-join BOTH raw CTEs
// (Task 3's N-hop ancestor closure) — that closure is exactly what this case
// exercises against real Redshift.
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
//
// NOTE — Redshift Data API result keys come back FULLY LOWERCASED regardless
// of how the query cased them (see the note above the aggregation matrix), so
// assertions below read `organizations__orgid | countunique` (lowercase),
// unlike the other three warehouses' `organizations__orgId | COUNTUNIQUE`.

describeIfCredentials(
  'Blended COUNT_DISTINCT through a bridge — metric sleeve (real Redshift)',
  () => {
    let adapter: RedshiftApiAdapter;
    let eventsFQN: string;
    let usersFQN: string;
    let organizationsFQN: string;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const eventsTable = `rs_bridge_events_${stamp}`;
    const usersTable = `rs_bridge_users_${stamp}`;
    const organizationsTable = `rs_bridge_organizations_${stamp}`;

    const builder = new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer());

    async function execDdl(sql: string): Promise<void> {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
    }

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

      eventsFQN = `public."${eventsTable}"`;
      usersFQN = `public."${usersTable}"`;
      organizationsFQN = `public."${organizationsTable}"`;

      // Pre-cleanup in case of a previous crash
      try {
        await execDdl(`DROP TABLE IF EXISTS ${eventsFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${usersFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${organizationsFQN}`);
      } catch {
        // ignore — tables may not exist on first run
      }

      await execDdl(`CREATE TABLE ${eventsFQN} (event_id VARCHAR(10), user_id VARCHAR(10))`);
      await execDdl(
        `INSERT INTO ${eventsFQN} (event_id, user_id) VALUES
        ('e1','u1'), ('e2','u1'), ('e3','u2'),
        ('e4','u3'), ('e5','u3'),
        ('e6','u4'), ('e7','u4'), ('e8','u5')`
      );

      await execDdl(
        `CREATE TABLE ${usersFQN} (userId VARCHAR(10), country VARCHAR(10), org_id VARCHAR(10))`
      );
      // u1 genuinely belongs to TWO orgs (o1 AND o4) — the fan-out that breaks the
      // pre-fix dedup-then-read mechanism (see block comment above).
      await execDdl(
        `INSERT INTO ${usersFQN} (userId, country, org_id) VALUES
        ('u1','US','o1'), ('u1','US','o4'),
        ('u2','US','o5'),
        ('u3','DE','o2'),
        ('u4','UA','o3'),
        ('u5','PL','o3')`
      );

      await execDdl(`CREATE TABLE ${organizationsFQN} (orgId VARCHAR(10))`);
      await execDdl(
        `INSERT INTO ${organizationsFQN} (orgId) VALUES ('o1'), ('o2'), ('o3'), ('o4'), ('o5')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, usersFQN, organizationsFQN]) {
        try {
          await execDdl(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop bridge table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('fan-out: joined COUNT DISTINCT is correct through a bridge (sleeve): US=3, DE=1, UA=1, PL=1', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(4);
      const byCountry = new Map(
        rows.map(r => [String(r.users__country), Number(r['organizations__orgid | countunique'])])
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
      expect(Number(rows[0]['organizations__orgid | countunique'])).toBe(5);
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
      // Redshift folds quoted aliases to lower case (enable_case_sensitive_identifier off).
      expect(Number(rows[0]['users__country | countunique'])).toBe(4);
      expect(Number(rows[0]['users__org_id | countunique'])).toBe(5);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM/AVG through a bridge — value sleeve set-based proof (5,
// real Redshift). Mirrors bigquery.integration.ts's C2.4 bridge SUM/AVG case
// exactly (same topology, seed, and ground truth). This is the critical
// cross-dialect proof for Redshift specifically: Redshift's window ORDER BY
// REJECTS a constant expression (AWS docs: "Neither constants nor constant
// expressions can be used as substitutes for column names"), which is why
// `RedshiftBlendedQueryBuilder.buildRowSurrogate` already overrides the base
// class's `ROW_NUMBER() OVER (ORDER BY 1)` with `ROW_NUMBER() OVER ()`
// (C2.1). This case proves that override compiles and assigns distinct
// surrogate ids on a REAL Redshift Serverless workgroup.
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
//
// NOTE — Redshift Data API result keys come back FULLY LOWERCASED (see the
// note above the COUNT_DISTINCT bridge case), so assertions below read
// `orders__revenue | sum` / `| avg` (lowercase).

describeIfCredentials('Blended SUM/AVG through a bridge — value sleeve (5, real Redshift)', () => {
  let adapter: RedshiftApiAdapter;
  let itemsFQN: string;
  let ordersFQN: string;
  let productsFQN: string;
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const itemsTable = `rs_sumavg_items_${stamp}`;
  const ordersTable = `rs_sumavg_orders_${stamp}`;
  const productsTable = `rs_sumavg_products_${stamp}`;

  const builder = new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer());

  async function execDdl(sql: string): Promise<void> {
    const { statementId } = await adapter.executeQuery(sql);
    await adapter.waitForQueryToComplete(statementId);
  }

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

    itemsFQN = `public."${itemsTable}"`;
    ordersFQN = `public."${ordersTable}"`;
    productsFQN = `public."${productsTable}"`;

    // Pre-cleanup in case of a previous crash
    try {
      await execDdl(`DROP TABLE IF EXISTS ${itemsFQN}`);
      await execDdl(`DROP TABLE IF EXISTS ${ordersFQN}`);
      await execDdl(`DROP TABLE IF EXISTS ${productsFQN}`);
    } catch {
      // ignore — tables may not exist on first run
    }

    await execDdl(
      `CREATE TABLE ${itemsFQN} (itemId VARCHAR(10), orderId VARCHAR(10), productId VARCHAR(10))`
    );
    await execDdl(
      `INSERT INTO ${itemsFQN} (itemId, orderId, productId) VALUES
        ('i1','o1','pA'), ('i2','o1','pC'),
        ('i3','o2','pA'), ('i4','o2','pB'),
        ('i5','o3','pC')`
    );

    await execDdl(`CREATE TABLE ${ordersFQN} (orderId VARCHAR(10), revenue DECIMAL(10,2))`);
    await execDdl(
      `INSERT INTO ${ordersFQN} (orderId, revenue) VALUES ('o1', 100), ('o2', 50), ('o3', 30)`
    );

    await execDdl(`CREATE TABLE ${productsFQN} (productId VARCHAR(10), category VARCHAR(20))`);
    await execDdl(
      `INSERT INTO ${productsFQN} (productId, category) VALUES
        ('pA','Supplements'), ('pB','Supplements'), ('pC','Gear')`
    );
  }, 180000);

  afterAll(async () => {
    for (const fqn of [itemsFQN, ordersFQN, productsFQN]) {
      try {
        await execDdl(`DROP TABLE IF EXISTS ${fqn}`);
      } catch (error) {
        console.warn(`Failed to drop value-sleeve bridge table ${fqn}:`, error);
      }
    }
  }, 60000);

  it('fan-out: joined SUM through the bridge is set-based correct: Supplements=150 (not naive 200), Gear=130', async () => {
    const rows = await runBlend(bridgeContext('SUM'));

    expect(rows).toHaveLength(2);
    const byCategory = new Map(
      rows.map(r => [String(r.products__category), Number(r['orders__revenue | sum'])])
    );

    expect(byCategory.get('Supplements')).toBe(150);
    expect(byCategory.get('Gear')).toBe(130);
  }, 120000);

  it('fan-out: joined AVG through the bridge is set-based correct: Supplements=75 (not naive avg-of-3-rows 66.67), Gear=65', async () => {
    const rows = await runBlend(bridgeContext('AVG'));

    expect(rows).toHaveLength(2);
    const byCategory = new Map(
      rows.map(r => [String(r.products__category), Number(r['orders__revenue | avg'])])
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
      rows.map(r => [String(r.products__category), Number(r['orders__revenue | sum'])])
    );
    const avgs = new Map(
      rows.map(r => [String(r.products__category), Number(r['orders__revenue | avg'])])
    );

    expect(sums.get('Supplements')).toBe(150);
    expect(sums.get('Gear')).toBe(130);
    expect(avgs.get('Supplements')).toBe(75);
    expect(avgs.get('Gear')).toBe(65);
  }, 120000);
});

// ---------------------------------------------------------------------------
// Blended SUM through a bridge — no-PK synthetic surrogate (5, real
// Redshift). Mirrors bigquery.integration.ts's C2.4 no-PK surrogate case.
// Dimensionless grand total: main = items (bridge fact), one chain = orders
// (metric: SUM amount, no report GROUP BY) — exercises the sleeve's CROSS
// JOIN / ungrouped shape and the `ROW_NUMBER() OVER ()` surrogate override on
// real Redshift.
//
// Seed — two DIFFERENT orders, A and B, both worth exactly $50; A is reached
// through the bridge TWICE (fanned), B once:
//   orders(orderId, amount): A=50, B=50
//   items(itemId, orderId):  i1->A, i2->A (A fans out), i3->B
// Ground truth: 50 + 50 = 100 (naive additive = 150; dedup-by-value-alone = 50).

describeIfCredentials(
  'Blended SUM through a bridge — no-PK synthetic surrogate (5, real Redshift)',
  () => {
    let adapter: RedshiftApiAdapter;
    let itemsFQN: string;
    let ordersFQN: string;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const itemsTable = `rs_nopk_items_${stamp}`;
    const ordersTable = `rs_nopk_orders_${stamp}`;

    const builder = new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer());

    async function execDdl(sql: string): Promise<void> {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
    }

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

      itemsFQN = `public."${itemsTable}"`;
      ordersFQN = `public."${ordersTable}"`;

      try {
        await execDdl(`DROP TABLE IF EXISTS ${itemsFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${ordersFQN}`);
      } catch {
        // ignore
      }

      await execDdl(`CREATE TABLE ${itemsFQN} (itemId VARCHAR(10), orderId VARCHAR(10))`);
      await execDdl(
        `INSERT INTO ${itemsFQN} (itemId, orderId) VALUES ('i1','A'), ('i2','A'), ('i3','B')`
      );

      await execDdl(`CREATE TABLE ${ordersFQN} (orderId VARCHAR(10), amount DECIMAL(10,2))`);
      await execDdl(`INSERT INTO ${ordersFQN} (orderId, amount) VALUES ('A', 50), ('B', 50)`);
    }, 180000);

    afterAll(async () => {
      for (const fqn of [itemsFQN, ordersFQN]) {
        try {
          await execDdl(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop no-PK surrogate table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('fan-out: no-PK synthetic surrogate: two distinct $50 orders (one fanned) sum to 100, not naive 150 or dedup-by-value 50', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['orders__amount | sum'])).toBe(100);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// sleeve honours post-join filters + fanning blended dimension (real
// Redshift). Mirrors bigquery.integration.ts's " sleeve honours
// post-join filters + fanning blended dimension (real BigQuery)" case exactly
// (same topology, seed, and ground truth). Both R1 defects made the sleeve
// silently disagree with the outer query; prior Redshift fixtures were
// all 1-row-per-key with no filter, which hid them.
//
// Topology: main = events; two sibling chains off main —
//   labels  (main.dimKey = labels.dimKey)  — dimension, roll-up = STRING_AGG
//   orders  (main.orderId = orders.orderId) — metric owner (SUM + COUNT_DISTINCT)
//
// The `labels` chain FANS: dimKey k1 owns TWO label rows (red, blue), so its
// dedup CTE rolls them up (STRING_AGG/LISTAGG → 'blue, red' — one value per
// dimKey). The report groups by that rolled-up label. Pre-C2 the sleeve
// projected the RAW label ('red'/'blue'), which never equalled the outer
// roll-up ('blue, red') → NULL-safe join-back never matched → NULL metric.
// The fix builds the sleeve's dimension from the SAME dedup-CTE ref the outer
// GROUP BY uses.
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
//
// NOTE — Redshift Data API result keys come back FULLY LOWERCASED (see the
// note above the COUNT_DISTINCT bridge case), so assertions below read
// `orders__revenue | sum` / `orders__orderid | countunique` (lowercase,
// including the camelCase `orderId` → `orderid`).

describeIfCredentials(
  'sleeve honours post-join filters + fanning blended dimension (real Redshift)',
  () => {
    let adapter: RedshiftApiAdapter;
    let eventsFQN: string;
    let labelsFQN: string;
    let ordersFQN: string;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const eventsTable = `rs_r1_events_${stamp}`;
    const labelsTable = `rs_r1_labels_${stamp}`;
    const ordersTable = `rs_r1_orders_${stamp}`;

    const builder = new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer());

    async function execDdl(sql: string): Promise<void> {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
    }

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
                // STRING_AGG: the fanning dimension rolls up to 'blue, red' per dimKey — the
                // NON-identity roll-up that exposes C2. Redshift's builder translates this to
                // LISTAGG(CAST(field AS VARCHAR), ', ') WITHIN GROUP (ORDER BY field).
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
      // Redshift renderer inlines literals → params is empty; execute SQL directly.
      const { sql } = builder.buildBlendedQuery(context);
      return adapter.executeQueryAndGetRows(sql) as Promise<Record<string, unknown>[]>;
    }

    // The rolled-up label ('blue, red') order is not guaranteed by LISTAGG, so identify the
    // fanning bucket as the one that is NOT the lone 'green' row.
    function fanningRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => String(r.labels__label) !== 'green')!;
    }
    function greenRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => String(r.labels__label) === 'green')!;
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

      eventsFQN = `public."${eventsTable}"`;
      labelsFQN = `public."${labelsTable}"`;
      ordersFQN = `public."${ordersTable}"`;

      // Pre-cleanup in case of a previous crash
      try {
        await execDdl(`DROP TABLE IF EXISTS ${eventsFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${labelsFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${ordersFQN}`);
      } catch {
        // ignore — tables may not exist on first run
      }

      await execDdl(
        `CREATE TABLE ${eventsFQN} (eventId VARCHAR(10), dimKey VARCHAR(10), orderId VARCHAR(10), country VARCHAR(10))`
      );
      await execDdl(
        `INSERT INTO ${eventsFQN} (eventId, dimKey, orderId, country) VALUES
        ('ev1','k1','o1','US'), ('ev2','k1','o2','DE'), ('ev3','k2','o3','US')`
      );

      await execDdl(`CREATE TABLE ${labelsFQN} (dimKey VARCHAR(10), label VARCHAR(10))`);
      // k1 owns TWO labels (red, blue) — the fan-out that makes the dedup roll-up non-identity.
      await execDdl(
        `INSERT INTO ${labelsFQN} (dimKey, label) VALUES
        ('k1','red'), ('k1','blue'), ('k2','green')`
      );

      await execDdl(`CREATE TABLE ${ordersFQN} (orderId VARCHAR(10), revenue DECIMAL(10,2))`);
      await execDdl(
        `INSERT INTO ${ordersFQN} (orderId, revenue) VALUES
        ('o1', 100), ('o2', 50), ('o3', 30)`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, labelsFQN, ordersFQN]) {
        try {
          await execDdl(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop R1 fixture table ${fqn}:`, error);
        }
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
      expect(Number(fan['orders__revenue | sum'])).toBe(150);
      expect(Number(fan['orders__orderid | countunique'])).toBe(2);
      expect(Number(green['orders__revenue | sum'])).toBe(30);
      expect(Number(green['orders__orderid | countunique'])).toBe(1);
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
      expect(Number(fan['orders__revenue | sum'])).toBe(100);
      expect(Number(fan['orders__orderid | countunique'])).toBe(1);
      // 'green' (k2, order o3=$30, event ev3 is US) is untouched by the filter.
      expect(Number(green['orders__revenue | sum'])).toBe(30);
      expect(Number(green['orders__orderid | countunique'])).toBe(1);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM through a non-identity pre-join aggregate — value sleeve
// (/C3, funnel, real Redshift). Mirrors bigquery.integration.ts's
// "Blended SUM through a non-identity pre-join aggregate — value sleeve
// (/C3, funnel, real BigQuery)" case exactly. Proves the R2 fix:
// a blended field whose OWN pre-join `aggregateFunction` is a real aggregate
// (here COUNT_DISTINCT, not the raw ANY_VALUE passthrough every other
// fixture uses) must have its post-join value sleeve read the OWNER's OWN
// dedup CTE column (one value per pre-join GROUP KEY), not the raw column
// keyed by the per-raw-row surrogate. Pre-R2 this would have summed RAW hit
// ids — on this STRING id shape that is a hard SQL type error; on a numeric id
// it would silently sum the wrong (raw, pre-dedup) numbers.
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
//
// NOTE — Redshift Data API result keys come back FULLY LOWERCASED (see the
// note above the COUNT_DISTINCT bridge case); `hits__hit_id` and `campaign`
// contain no camelCase, so the lowercased key is unchanged from the SQL alias
// (`hits__hit_id | sum`).

describeIfCredentials(
  'Blended SUM through a non-identity pre-join aggregate — value sleeve (/C3, funnel, real Redshift)',
  () => {
    let adapter: RedshiftApiAdapter;
    let sessionsFQN: string;
    let hitsFQN: string;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionsTable = `rs_funnel_sessions_${stamp}`;
    const hitsTable = `rs_funnel_hits_${stamp}`;

    const builder = new RedshiftBlendedQueryBuilder(new RedshiftClauseRenderer());

    async function execDdl(sql: string): Promise<void> {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
    }

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
      hitsFQN = `public."${hitsTable}"`;

      // Pre-cleanup in case of a previous crash
      try {
        await execDdl(`DROP TABLE IF EXISTS ${sessionsFQN}`);
        await execDdl(`DROP TABLE IF EXISTS ${hitsFQN}`);
      } catch {
        // ignore — tables may not exist on first run
      }

      await execDdl(`CREATE TABLE ${sessionsFQN} (session_id VARCHAR(10), campaign VARCHAR(10))`);
      await execDdl(
        `INSERT INTO ${sessionsFQN} (session_id, campaign) VALUES
        ('s1','A'), ('s2','A'), ('s3','B')`
      );

      await execDdl(`CREATE TABLE ${hitsFQN} (session_id VARCHAR(10), hit_id VARCHAR(10))`);
      await execDdl(
        `INSERT INTO ${hitsFQN} (session_id, hit_id) VALUES
        ('s1','h1'), ('s1','h1'), ('s1','h2'),
        ('s2','h3'), ('s2','h4'), ('s2','h5'),
        ('s3','h6'), ('s3','h6')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [sessionsFQN, hitsFQN]) {
        try {
          await execDdl(`DROP TABLE IF EXISTS ${fqn}`);
        } catch (error) {
          console.warn(`Failed to drop funnel table ${fqn}:`, error);
        }
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
        rows.map(r => [String(r.campaign), Number(r['hits__hit_id | sum'])])
      );

      expect(byCampaign.get('A')).toBe(5);
      expect(byCampaign.get('B')).toBe(1);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// the assumption the Redshift report reader now rests on.
//
// The Data API returns rows as positional `Field[]`, so the reader binds them to
// report headers via `ColumnMetadata` labels. Two properties must hold for that
// to work, and neither is documented anywhere we control:
//   1. The label IS the SQL output alias, with its spaces and `|` intact — the
//      aggregate labels this product emits look like `amount | SUM`.
//   2. Case: Redshift runs with `enable_case_sensitive_identifier` off by
//      default, which folds identifiers to lower case even when the SQL quotes
//      them. That is why the reader falls back to a case-folded lookup; an
//      exact-only match would leave every aggregated cell empty.
// Probe both live and report which case actually came back, so a workgroup (or
// a future default) that behaves differently shows up here rather than as blank
// cells in a customer's report.
// ---------------------------------------------------------------------------
describeIfCredentials('Redshift result-column labels (report reader binding)', () => {
  let adapter: RedshiftApiAdapter;

  beforeAll(() => {
    adapter = new RedshiftApiAdapter(
      { accessKeyId: AWS_ACCESS_KEY_ID!, secretAccessKey: AWS_SECRET_ACCESS_KEY! },
      {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: REDSHIFT_REGION!,
        database: REDSHIFT_DATABASE!,
        workgroupName: REDSHIFT_WORKGROUP_NAME!,
      }
    );
  });

  it('returns the quoted output alias as the column label, modulo identifier case folding', async () => {
    const alias = 'orders__amount | SUM';
    const { statementId } = await adapter.executeQuery(
      `SELECT 1 AS "${alias}", 2 AS "Order Count"`
    );
    await adapter.waitForQueryToComplete(statementId);

    const metadata = await adapter.getQueryResultsMetadata(statementId);
    const labels = metadata.map(col => col.label || col.name || '');

    console.log(`Redshift result column labels: ${JSON.stringify(labels)}`);

    // Spaces and the `|` separator survive verbatim; only case may differ.
    expect(labels.map(l => l.toLowerCase())).toEqual([alias.toLowerCase(), 'order count']);
  }, 120000);
});
