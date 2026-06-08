import { RedshiftApiAdapter } from 'src/data-marts/data-storage-types/redshift/adapters/redshift-api.adapter';
import { RedshiftCredentials } from 'src/data-marts/data-storage-types/redshift/schemas/redshift-credentials.schema';
import { RedshiftConfig } from 'src/data-marts/data-storage-types/redshift/schemas/redshift-config.schema';
import { RedshiftConnectionType } from 'src/data-marts/data-storage-types/redshift/enums/redshift-connection-type.enum';
import { RedshiftClauseRenderer } from 'src/data-marts/data-storage-types/redshift/services/redshift-clause-renderer';
import { RedshiftQueryBuilder } from 'src/data-marts/data-storage-types/redshift/services/redshift-query.builder';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';

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
    }, 30000);

    it('should reject invalid credentials', async () => {
      const invalidAdapter = new RedshiftApiAdapter(
        { accessKeyId: 'INVALID_KEY_ID', secretAccessKey: 'invalid_secret' },
        config
      );
      await expect(invalidAdapter.checkAccess()).rejects.toThrow();
    }, 30000);
  });

  describe('SQL Dry Run', () => {
    it('should validate correct query via EXPLAIN', async () => {
      await expect(adapter.executeDryRunQuery('SELECT 1')).resolves.not.toThrow();
    }, 30000);

    it('should reject invalid SQL syntax', async () => {
      await expect(adapter.executeDryRunQuery('SELEKT * FORM invalid')).rejects.toThrow();
    }, 30000);
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
            '13:45:00', '13:45:00+00')
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
    }, 30000);

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
    }, 30000);

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
    }, 30000);

    it('TIMESTAMP: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'ts_col', operator: 'gte', value: '2020-01-01' }],
      });
      console.log(`[COERCION] TIMESTAMP gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    }, 30000);

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
    }, 30000);

    it('TIMESTAMPTZ: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'tstz_col', operator: 'gte', value: '2020-01-01' }],
      });
      console.log(`[COERCION] TIMESTAMPTZ gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    }, 30000);

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
    }, 30000);

    it('TIME: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'time_col', operator: 'gte', value: '09:00:00' }],
      });
      console.log(`[COERCION] TIME gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    }, 30000);

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
    }, 30000);

    it('TIMETZ: gte bare string literal executes without error', async () => {
      const rows = await runFilter({
        filters: [{ column: 'timetz_col', operator: 'gte', value: '09:00:00+00' }],
      });
      console.log(`[COERCION] TIMETZ gte bare string → ${rows.length} rows, no error`);
      expect(rows.length).toBeGreaterThan(0);
    }, 30000);

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
    }, 30000);

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
    }, 30000);

    it('relative_date this_month excludes future-dated row 5', async () => {
      const rows = await runFilter({
        filters: [{ column: 'date_col', operator: 'relative_date', value: { kind: 'this_month' } }],
      });
      const resultIds = ids(rows);
      expect(resultIds).not.toContain('5');
      console.log(`[this_month] rows returned: [${resultIds.join(',')}]`);
    }, 30000);

    // -------------------------------------------------------------------------
    // Operator matrix: every operator runs without error, returns sensible rows
    // -------------------------------------------------------------------------
    // Seeded amounts: alpha(1)=10, beta(2)=20, O'Brien(3)=30, 100%(4)=40, a\b(5)=50, gamma(6)=0.

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
      // beta(2) contains 'eta'; others do not
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

    it('regex: name ~ "^alp" → row 1', async () => {
      const rows = await runFilter({
        filters: [{ column: 'name', operator: 'regex', value: '^alp' }],
      });
      expect(ids(rows)).toEqual(['1']);
    }, 30000);

    it('not_regex: name !~ "^alp" → rows 2,3,4,5,6', async () => {
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

    it('relative_date last_n_days(7): rows 1,2,5,6 (lower-bound only; future row 5 included)', async () => {
      const rows = await runFilter({
        filters: [
          { column: 'date_col', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
        ],
      });
      // last_n_days has NO upper bound by design (deferred item): future-dated rows
      // (row 5 is +13 months) are included. Asserts the actual lower-bound-only behavior.
      expect(ids(rows)).toEqual(['1', '2', '5', '6']);
    }, 30000);

    it('relative_date last_n_months(3): rows 1,2,3,5,6 (lower-bound only; future row 5 included)', async () => {
      const rows = await runFilter({
        filters: [
          {
            column: 'date_col',
            operator: 'relative_date',
            value: { kind: 'last_n_months', n: 3 },
          },
        ],
      });
      // last_n_months has NO upper bound by design (deferred): future row 5 included.
      expect(ids(rows)).toEqual(['1', '2', '3', '5', '6']);
    }, 30000);

    // -------------------------------------------------------------------------
    // Wildcard-literal safety
    // -------------------------------------------------------------------------

    it('SAFETY contains "100%" on name → only row 4 (% is not a LIKE wildcard)', async () => {
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
      expect(rows.map(r => r.id)).toEqual(['5', '4']);
    }, 30000);
  }
);
