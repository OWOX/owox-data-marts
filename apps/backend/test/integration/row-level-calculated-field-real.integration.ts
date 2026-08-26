import { BadRequestException, INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { AthenaApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/athena-api.adapter';
import { S3ApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/s3-api.adapter';
import { BigQueryApiAdapter } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api.adapter';
import { BigQueryServiceAccountCredentialsSchema } from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import { BIGQUERY_AUTODETECT_LOCATION } from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DatabricksApiAdapter } from 'src/data-marts/data-storage-types/databricks/adapters/databricks-api.adapter';
import { DatabricksAuthMethod } from 'src/data-marts/data-storage-types/databricks/enums/databricks-auth-method.enum';
import { RedshiftApiAdapter } from 'src/data-marts/data-storage-types/redshift/adapters/redshift-api.adapter';
import { RedshiftConnectionType } from 'src/data-marts/data-storage-types/redshift/enums/redshift-connection-type.enum';
import { SnowflakeApiAdapter } from 'src/data-marts/data-storage-types/snowflake/adapters/snowflake-api.adapter';
import { SnowflakeAuthMethod } from 'src/data-marts/data-storage-types/snowflake/enums/snowflake-auth-method.enum';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from 'src/data-marts/data-storage-types/data-storage-providers';
import { DataStorageReportReader } from 'src/data-marts/data-storage-types/interfaces/data-storage-report-reader.interface';
import { DataMartSchemaField } from 'src/data-marts/data-storage-types/data-mart-schema.type';
import { columnFilterWithoutCalculatedFields } from 'src/data-marts/calculated-fields/calculated-field.utils';
import { ReportLikeReadPlan } from 'src/data-marts/dto/domain/report-like-read-plan';
import { BlendableSchemaAccessor } from 'src/data-marts/services/blendable-schema.service';
import { BlendedReportDataService } from 'src/data-marts/services/blended-report-data.service';
import { OutputControlsValidatorService } from 'src/data-marts/services/output-controls-validator.service';
import { ReportSqlComposerService } from 'src/data-marts/services/report-sql-composer.service';
import { ReportTotalsService } from 'src/data-marts/services/report-totals.service';
import { DataMartService } from 'src/data-marts/services/data-mart.service';
import { TypeResolver } from 'src/common/resolver/type-resolver';

/**
 * Row-level Calculated Fields — LIVE warehouse proof on all five
 * storages.
 *
 * Every guarantee these slices make was pinned as an emitted SQL STRING per dialect and executed
 * against nothing. This suite executes them: it seeds real tables, adds a row-level calculated
 * field (`session_key`) and an aggregate-level one (`bonus_rate`) through the real save path —
 * which DERIVES the level from the formula — and then drives `ReportSqlComposerService.compose`
 * plus the storage's real report reader and `ReportTotalsService` through the real Nest DI
 * container, exactly as `RunReportService` does.
 *
 * What is proven for a report on ONE Data Mart:
 *   1. A row-level field alone does NOT make the query aggregated: every source row comes
 *      back, no implicit DISTINCT.
 *   2. Grouped beside a report aggregation, the grain is one row per distinct FORMULA VALUE,
 *      not one per combination of the columns the formula mentions.
 *   3. Totals excludes it and stays a grand total over the whole filtered dataset.
 *   4. A metric (HAVING) filter keeps the same row set for the report and for Totals.
 *   5. A row-level and an aggregate-level formula compose together.
 *
 * And, on a report that LEFT JOINs a second Data Mart:
 *   6. Grouped by one main column PLUS the formula, a joined aggregate is computed at that
 *      full grain. This is the one shape whose naive implementation returns a plausible WRONG
 *      NUMBER instead of an error: a metric sleeve that stopped at `channel` joins back through
 *      `ANY_VALUE` and hands every row its channel's entire revenue.
 *   7. The ungrouped joined report projects the formula per row (before this work the column was
 *      absent from the SQL: blank on three warehouses, an exception on two).
 *   8. A metric filter restricts joined Totals at the report's own grain.
 *   9. A grain finer than the join key leaves the joined column ABOVE the joined mart's true
 *      total while Totals stays at it. Correct behaviour, pinned so a "fix" fails loudly.
 *
 * And, once the REPORT applies an aggregation to the row-level field — `COUNT_DISTINCT(session_key)`
 * — so that it stops being a grouping key and becomes a metric of that query:
 *  10. On a plain report grouped by ONE ordinary column, the field leaves the GROUP BY. The
 *      failure this catches is the wrong SQL: the aggregate emitted while the expression
 *      stays a grouping key, which returns **1 on every row** with no error on any warehouse.
 *  11. The same on a JOINED report, where the field must leave the metric sleeve's grain as
 *      well as the outer GROUP BY, or the sleeve joins back at a finer grain than the outer query.
 *  12. The same on a BLENDED report with NO sleeve, the one composition where neither of the
 *      builder's count/membership assertions runs: `MetricSleeveBuilder.buildAll`'s grain guard is
 *      all that stands between it and a silent wrong number.
 *  13. An aggregated row-level field is still never a Totals metric, asserted as a NUMBER
 *      (the count it would publish appears nowhere in the block) rather than as a missing key.
 *
 * And, once a formula may reference ANOTHER formula of the same Data Mart:
 *  14. `roas = revenue / cost` over two aggregate-level formulas, on a report grouped by one
 *      ordinary column. This is the feature's headline formula AND its signature failure: A's own
 *      token stream holds no aggregate call, so the non-transitive level derivation classifies it
 *      a row-level dimension and the report collapses to ONE row of valid SQL with no error and no
 *      log line. Two groups whose ratios differ from each other and from the collapsed one are
 *      what make that visible.
 *  15. A row-level formula reading another row-level formula stays a GROUPING KEY: three groups,
 *      not the four its columns give, not the five rows and not one.
 *  16. A dependency is never a column. Asserted on the SQL as well as on the returned keys,
 *      because an absent column cannot be read off returned rows.
 *  17. The same on a BLENDED report: the same numbers beside a joined metric, which is the one shape
 *      where the dependency's COLUMNS must reach the main CTE or every dialect answers
 *      `Unrecognized name`.
 *
 * And, once a row-level formula may be BUCKETED BY DATE and an arithmetic aggregation imposes the
 * analyst's DECLARED type on the warehouse:
 *  18. A DATE-declared row-level formula grouped by MONTH. The seat lifted here is a save-
 *      time refusal, so the validator is asked as well as the warehouse, and the unbucketed twin
 *      of the same report is executed beside it: nine rows against three.
 *  19. The same bucket on a BLENDED report whose metric is a joined `COUNT_DISTINCT`. That
 *      is the one shape where a sleeve that dropped the truncation reads as a confident **0**
 *      rather than a NULL, and the only one that exercises `buildCountingSleeveCte`.
 *  20. `SUM` over a FLOAT-declared formula returning numeric STRINGS. Redshift coerced
 *      every row to `Decimal` at scale 0 and published `12` for `12.75`; the cast is what states
 *      the scale. Measured for the dialect's exact-decimal spellings too.
 *  21. An INTEGER declaration is NOT cast. Asserted on a float-returning formula, whose
 *      total keeps its fractional part, and on the named cost: over TEXT it still raises on
 *      BigQuery and Athena where the same field declared FLOAT now returns a number.
 *  22. A JOINED Data Mart's calculated field is refused even in the quiet
 *      shape, where the joined table still carries a real column of the formula's name and the SQL
 *      would be valid.
 *  23. The day-ambiguous `05/08/2026` under a time zone, now REFUSED before any SQL is
 *      composed. Snowflake read it as May on 2026-08-24; `CONVERT_TIMEZONE` is the only string
 *      shape it ever returned a value for, so the zone was the door and the zone is what went.
 *  24. The exact-decimal trade, stated as a loud error: a value beyond `DECIMAL(38,18)` and
 *      `NUMERIC(38,9)` alike raises, while the same value under a FLOAT declaration still sums.
 *
 * THE FIXTURE IS THE PROOF. Rows 1 and 2 carry DIFFERENT `part_a`/`part_b` values that produce the
 * SAME `session_key`, so "group by the expression" and "group by the columns the expression
 * mentions" return a different number of rows with different sums. `channel` is coarser than the
 * formula and customer `c3` is finer than the join key, so the right answer and each wrong answer
 * differ by a visible margin in both directions. Without those three properties every assertion
 * here would pass under a reading the slice rejects.
 *
 * The aggregated half seeds a THIRD table for the same reason, and cannot borrow the one above: five rows
 * cannot hold two groups that each carry a distinct count differing from BOTH 1 and their own row
 * count, and without that property `COUNT_DISTINCT` returns 1 whether the field was aggregated or
 * left in the grouping keys — the right answer and the signature wrong answer coincide. See
 * `AGG_SEED_ROWS`. It joins the SAME `orders` mart, so it costs one table rather than two.
 *
 * Required environment variables (loaded from .env.tests via setup-env.ts) — a storage whose vars
 * are missing skips and the run still exits 0:
 *   BigQuery   BQ_SERVICE_ACCOUNT_KEY, BQ_PROJECT_ID, BQ_DATASET
 *   Athena     AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ATHENA_REGION, ATHENA_OUTPUT_BUCKET,
 *              ATHENA_DATABASE
 *   Redshift   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, REDSHIFT_REGION, REDSHIFT_WORKGROUP_NAME,
 *              REDSHIFT_DATABASE
 *   Snowflake  SNOWFLAKE_ACCOUNT, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD,
 *              SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA
 *   Databricks DATABRICKS_HOST, DATABRICKS_HTTP_PATH, DATABRICKS_TOKEN, DATABRICKS_CATALOG,
 *              DATABRICKS_SCHEMA
 */

// ---------------------------------------------------------------------------
// The fixture, and every number this suite asserts, computed by hand from it.
// ---------------------------------------------------------------------------

interface SeedRow {
  channel: string;
  customer_id: string;
  part_a: string;
  part_b: string;
  amount: number;
  bonus: number;
}

/**
 * `session_key` = part_a ++ part_b. Rows 1 and 2 are the load-bearing pair: `('x','yz')` and
 * `('xy','z')` are DIFFERENT inputs producing the SAME 'xyz'. Rows 3 and 4 are the control — same
 * inputs, so both groupings agree there and only the first pair discriminates.
 *
 * `channel` and `customer_id` serve the JOINED report and are invisible to the five
 * flat tests, which select neither. `channel` is the COARSE dimension the sleeve's grain must
 * not stop at; `customer_id` is the join key. The two are deliberately NOT nested: `session_key`
 * splits 'paid' into two groups (finer than `channel`), and customer `c3` spans two different
 * `channel` values (finer than the join key).
 */
const SEED_ROWS: readonly SeedRow[] = [
  { channel: 'paid', customer_id: 'c1', part_a: 'x', part_b: 'yz', amount: 10, bonus: 1 },
  { channel: 'paid', customer_id: 'c2', part_a: 'xy', part_b: 'z', amount: 20, bonus: 3 },
  { channel: 'paid', customer_id: 'c3', part_a: 'p', part_b: 'q', amount: 30, bonus: 2 },
  { channel: 'organic', customer_id: 'c3', part_a: 'p', part_b: 'q', amount: 40, bonus: 6 },
  { channel: 'organic', customer_id: 'c4', part_a: 'm', part_b: 'n', amount: 5, bonus: 5 },
];

const SOURCE_ROW_COUNT = 5;

/** Every row's `session_key`, so the plain projection can be compared as a MULTISET. */
const SESSION_KEYS_OF_EVERY_ROW = ['xyz', 'xyz', 'pq', 'pq', 'mn'];

/** GROUP BY CONCAT(part_a, part_b) — the correct grain. */
const DISTINCT_SESSION_KEYS = 3;

/** GROUP BY part_a, part_b — the rejected alternative. Differs from the above; that is the point. */
const DISTINCT_INPUT_COMBINATIONS = 4;

/** SUM(amount) per distinct session_key: 10+20, 30+40, 5. */
const SUM_BY_SESSION_KEY: Record<string, number> = { xyz: 30, pq: 70, mn: 5 };
const ROW_COUNT_BY_SESSION_KEY: Record<string, number> = { xyz: 2, pq: 2, mn: 1 };

/**
 * SUM(amount) per (part_a, part_b) — the four numbers the REJECTED grouping would publish. 10 and
 * 20 appear in no correct result, so seeing either falsifies that grain.
 */
const SUM_BY_INPUT_COMBINATION_ONLY = [10, 20];

/** SUM(bonus)/SUM(amount) per session_key: 4/30, 8/70, 5/5. */
const BONUS_RATE_BY_SESSION_KEY: Record<string, number> = {
  xyz: 4 / 30,
  pq: 8 / 70,
  mn: 5 / 5,
};

// Grand totals over all five rows: 10+20+30+40+5, /5, min, max, and 17/105.
const GRAND_TOTAL_SUM = 105;
const GRAND_TOTAL_AVG = 21;
const GRAND_TOTAL_MIN = 5;
const GRAND_TOTAL_MAX = 40;
const GRAND_TOTAL_BONUS_RATE = 17 / 105;

/** HAVING SUM(amount) > 25 keeps 'xyz' (30) and 'pq' (70); it drops 'mn' (5). */
const HAVING_THRESHOLD = 25;
const KEPT_SESSION_KEYS = ['pq', 'xyz'];
/** SUM(amount) over the ROWS of the kept groups: 10+20+30+40. Not 105 — 'mn' is gone. */
const KEPT_ROWS_SUM = 100;

const SESSION_KEY = 'session_key';
const BONUS_RATE = 'bonus_rate';
const AMOUNT_SUM = 'amount | SUM';
const ROW_COUNT = 'Row Count';
const CHANNEL = 'channel';

// ---------------------------------------------------------------------------
// The JOINED fixture, and every number this half asserts, computed by hand.
//
// A second Data Mart (`orders`) is LEFT JOINed on `customer_id`. Report grain is
// (channel, session_key) — one plain main column plus the ROW-LEVEL FORMULA — with a JOINED
// aggregate metric beside it. That is the shape this measures.
// ---------------------------------------------------------------------------

interface OrderRow {
  customer_id: string;
  revenue: number;
  /**
   * The dates/types half only, and never selected by the nine tests below: a real column of the joined TABLE
   * whose name a SECOND Data Mart over that same table gives to a formula. See `ORDER_CTR_BY_CUSTOMER`.
   */
  ctr: number;
}

/**
 * Exactly ONE row per customer. The sleeve de-duplicates joined rows before aggregating, so a
 * customer with two order rows would make every number below depend on that de-duplication as
 * well as on the grain — and the grain is what this half measures. One row per customer leaves
 * the grain as the only variable.
 */
const ORDER_ROWS: readonly OrderRow[] = [
  { customer_id: 'c1', revenue: 100, ctr: 0.11 },
  { customer_id: 'c2', revenue: 11, ctr: 0.22 },
  { customer_id: 'c3', revenue: 30, ctr: 0.33 },
  { customer_id: 'c4', revenue: 7, ctr: 0.44 },
];

const ORDERS_ALIAS = 'orders';
/** `<targetAlias>__<field>` — what `buildBlendedFieldUnifiedName` produces for a flat field. */
const ORDERS_REVENUE = `${ORDERS_ALIAS}__revenue`;
const ORDERS_REVENUE_SUM = `${ORDERS_REVENUE} | SUM`;

/** SUM over the joined mart itself: 100+11+30+7. Totals is dimensionless, so it must show this. */
const JOINED_REVENUE_TRUE_TOTAL = 148;

interface JoinedGroup {
  revenue: number;
  amount: number;
  rowCount: number;
}

/**
 * The report grouped by (channel, session_key). `revenue` is the sum over the DISTINCT order rows
 * the group's main rows reach:
 *   paid|xyz    rows 1,2 → c1,c2 → 100+11
 *   paid|pq     row 3    → c3    → 30
 *   organic|pq  row 4    → c3    → 30   (c3 again — it spans two channels: the fan-out)
 *   organic|mn  row 5    → c4    → 7
 */
const JOINED_GROUPS: Record<string, JoinedGroup> = {
  'paid|xyz': { revenue: 111, amount: 30, rowCount: 2 },
  'paid|pq': { revenue: 30, amount: 30, rowCount: 1 },
  'organic|pq': { revenue: 30, amount: 40, rowCount: 1 },
  'organic|mn': { revenue: 7, amount: 5, rowCount: 1 },
};

/**
 * What a sleeve whose grain stopped at `channel` — the outer query's grain MINUS the formula —
 * would publish through `ANY_VALUE`: the channel's whole revenue on every one of its rows. No
 * NULL, no warehouse error, and none of these four numbers equals the correct one beside it.
 *   paid    → c1,c2,c3 → 100+11+30
 *   organic → c3,c4    → 30+7
 */
const JOINED_REVENUE_AT_CHANNEL_GRAIN: Record<string, number> = { paid: 141, organic: 37 };

/** GROUP BY channel, part_a, part_b — the rejected reading. 5 ≠ 4; that is the point. */
const JOINED_GROUPS_BY_INPUT_COLUMNS = 5;
/** The two revenues ONLY that reading produces: 'paid|xyz' split back into c1 and c2. */
const JOINED_REVENUE_BY_INPUT_COLUMNS_ONLY = [100, 11];

/**
 * The semantics nothing had measured. Grouping by a row-level expression finer than the
 * join key makes c3's single order survive once per (channel, session_key) tuple it touches, so
 * the visible revenue column sums to 178 while Totals — a separate dimensionless query — stays at
 * the joined mart's true 148. The 30 between them IS c3's order, counted in both of its groups.
 * CORRECT BEHAVIOUR, pinned so that "fixing" the discrepancy fails loudly.
 */
const JOINED_REVENUE_COLUMN_SUM = 178;
/** The same sum for the MAIN column, which cannot fan out: 30+30+40+5 = the grand total. */
const AMOUNT_COLUMN_SUM = 105;

/** The ungrouped joined report: one row per main row, formula projected. */
const UNGROUPED_JOINED_ROWS: readonly { channel: string; session_key: string; revenue: number }[] =
  [
    { channel: 'paid', session_key: 'xyz', revenue: 100 },
    { channel: 'paid', session_key: 'xyz', revenue: 11 },
    { channel: 'paid', session_key: 'pq', revenue: 30 },
    { channel: 'organic', session_key: 'pq', revenue: 30 },
    { channel: 'organic', session_key: 'mn', revenue: 7 },
  ];

/**
 * `HAVING SUM(amount) > 25` on the joined report keeps three of the four groups — and drops one
 * group from a channel whose OTHER group it keeps. That is what makes the restriction's grain
 * measurable: at the coarse `channel` grain both channels pass (paid 60, organic 45), so a
 * restriction that lost the formula key would keep every row and return the unrestricted totals.
 */
const JOINED_KEPT_GROUP_KEYS = ['organic|pq', 'paid|pq', 'paid|xyz'];
/** Totals over the ROWS of the kept groups (main rows 1-4): 10+20+30+40. Not 105. */
const JOINED_KEPT_AMOUNT_TOTAL = 100;
/** The distinct orders those rows reach: c1,c2,c3 = 100+11+30. Not 148. */
const JOINED_KEPT_REVENUE_TOTAL = 141;

// ---------------------------------------------------------------------------
// The AGGREGATED fixture: a report applies COUNT_DISTINCT to the row-level formula, so
// the field stops being a grouping key and becomes a metric of that query. Every number below is
// computed by hand from the eight rows in `AGG_SEED_ROWS`.
//
// A table of its own, because the flat/joined fixture CANNOT express what this half measures. The
// signature failure here is the aggregate emitted while the expression stays in the
// GROUP BY, which returns 1 for every row — so a group holding one row per distinct formula value
// returns the same 1 whether the code is right or wrong. Both groups below therefore hold four
// rows and a distinct count that is neither 1 nor their row count, and the two groups' counts
// differ from each other so neither can be read off the other.
//
// The joined half reuses the SAME `orders` mart (c1=100, c2=11, c3=30, c4=7).
// ---------------------------------------------------------------------------

interface AggSeedRow {
  country: string;
  customer_id: string;
  part_a: string;
  part_b: string;
  amount: number;
}

/**
 * `session_key` = part_a ++ part_b, the same formula the flat/joined table carries.
 *
 * Four load-bearing properties, all of them measured:
 *   - every group holds 4 rows and 2 or 3 distinct session_keys — neither 1 (the wrong
 *     answer) nor 4 (a COUNT that lost its DISTINCT);
 *   - rows 1/2 and rows 5/6 pair DIFFERENT inputs onto the SAME key, so "distinct expression
 *     values" (2, 3) and "distinct (part_a, part_b) combinations" (3, 4) disagree in both groups;
 *   - a customer repeats WITHIN a group (c1 in US, c3 in UK), so the sleeve's de-duplication is
 *     live rather than inert — without it US reads 241 instead of 141;
 *   - 'pq' appears in both countries, so the report-wide distinct count (4) is neither the sum of
 *     the per-group counts (5) nor either of them. Distinct counts do not add up, which is the
 *     number Totals deliberately keeps out.
 */
const AGG_SEED_ROWS: readonly AggSeedRow[] = [
  { country: 'US', customer_id: 'c1', part_a: 'x', part_b: 'yz', amount: 10 },
  { country: 'US', customer_id: 'c2', part_a: 'xy', part_b: 'z', amount: 20 },
  { country: 'US', customer_id: 'c1', part_a: 'p', part_b: 'q', amount: 30 },
  { country: 'US', customer_id: 'c3', part_a: 'p', part_b: 'q', amount: 40 },
  { country: 'UK', customer_id: 'c3', part_a: 'm', part_b: 'no', amount: 15 },
  { country: 'UK', customer_id: 'c3', part_a: 'mn', part_b: 'o', amount: 6 },
  { country: 'UK', customer_id: 'c4', part_a: 'r', part_b: 's', amount: 7 },
  { country: 'UK', customer_id: 'c2', part_a: 'p', part_b: 'q', amount: 8 },
];

const AGG_SOURCE_ROW_COUNT = 8;

interface AggGroup {
  /** COUNT_DISTINCT(session_key) — the number under test. */
  distinctSessionKeys: number;
  /** Rows behind the group. Equal to COUNT(session_key), which the distinct count must not be. */
  rowCount: number;
  /** SUM(amount) over those rows. */
  amount: number;
  /** SUM over the DISTINCT orders the group's rows reach — c1 in US and c3 in UK repeat. */
  revenue: number;
  /** Distinct (part_a, part_b) pairs — what counting the columns instead of the expression gives. */
  distinctInputCombinations: number;
}

/**
 *   US   rows 1-4  keys xyz,xyz,pq,pq   → 2 distinct; customers c1,c2,c1,c3 → 100+11+30
 *   UK   rows 5-8  keys mno,mno,rs,pq   → 3 distinct; customers c3,c3,c4,c2 → 30+7+11
 */
const AGG_GROUPS: Record<string, AggGroup> = {
  US: {
    distinctSessionKeys: 2,
    rowCount: 4,
    amount: 100,
    revenue: 141,
    distinctInputCombinations: 3,
  },
  UK: {
    distinctSessionKeys: 3,
    rowCount: 4,
    amount: 36,
    revenue: 48,
    distinctInputCombinations: 4,
  },
};

/**
 * What the wrong SQL publishes — `GROUP BY country, CONCAT(part_a, part_b)`. Five rows
 * instead of two, and the metric is the CONSTANT 1 on every one of them: a group defined by a
 * distinct value holds exactly one. No NULL, no warehouse error, on any of the five storages.
 */
const AGG_WRONG_GRAIN_ROWS = 5;
const AGG_WRONG_GRAIN_DISTINCT = 1;
/** SUM(amount) at that grain: US|xyz 30, US|pq 70, UK|mno 21, UK|rs 7, UK|pq 8. */
const AGG_WRONG_GRAIN_AMOUNTS = [30, 70, 21, 7, 8];
/** And its joined revenues: c1+c2, c1+c3, c3, c4, c2. None equals 141 or 48. */
const AGG_WRONG_GRAIN_REVENUES = [111, 130, 30, 7, 11];

/**
 * The joined revenue a sleeve that did NOT de-duplicate would report: c1's order added twice in
 * US, c3's twice in UK. The joined live gate seeded one order per customer AND no repeated customer
 * within a group, so its dedup was inert and this contrast could not be drawn there.
 */
const AGG_REVENUE_WITHOUT_DEDUP: Record<string, number> = { US: 241, UK: 78 };

// Grand totals over all eight rows: 136, 136/8, min, max. Deliberately none of them is 2, 3, 4 or
// 5 — the four counts the Totals test sweeps the block for.
const AGG_GRAND_TOTAL_AMOUNT = 136;
const AGG_GRAND_TOTAL_AVG = 17;
const AGG_GRAND_TOTAL_MIN = 6;
const AGG_GRAND_TOTAL_MAX = 40;

/**
 * COUNT_DISTINCT(session_key) over the whole dataset — {xyz, pq, mno, rs}. This is the number a
 * Totals block would carry if the exclusion were lifted, which is why the test looks for the VALUE rather
 * than for the key: a block that gained the metric under any other name still fails.
 */
const AGG_REPORT_WIDE_DISTINCT_SESSION_KEYS = 4;
/** The other plausible wrong total: the per-group counts added up. 2+3 ≠ 4, and neither belongs. */
const AGG_SUM_OF_GROUP_DISTINCTS = 5;

const COUNTRY = 'country';
const SESSION_KEY_COUNT_DISTINCT = `${SESSION_KEY} | COUNTUNIQUE`;
/**
 * A JOINED string column with COUNT — the one aggregate on a joined field that `SLEEVE_ROUTING`
 * maps to `null`, so it is computed in the outer SELECT off the dedup CTE and the query carries no
 * sleeve at all. That is what makes requirement 12's composition reachable.
 */
const ORDERS_CUSTOMER_ID = `${ORDERS_ALIAS}__customer_id`;
const ORDERS_CUSTOMER_ID_COUNT = `${ORDERS_CUSTOMER_ID} | COUNT`;

// ---------------------------------------------------------------------------
// A formula referencing another formula — every number below computed by hand
// from the FIVE-ROW main table above, which already carries the two numeric columns and the coarse
// dimension this half needs. Reusing it costs no extra warehouse table and, being read through a
// SEPARATE Data Mart, cannot move a number the thirteen tests above assert.
//
// `roas = revenue / cost` over two aggregate-level formulas is the feature's headline use case and
// The silent wrong number: A's OWN token stream holds no aggregate call — both live in the
// strings it references — so the non-transitive level derivation reads it as a row-level dimension.
// ---------------------------------------------------------------------------

const REVENUE = 'revenue';
const COST = 'cost';
const ROAS = 'roas';
const SESSION_UPPER = 'session_upper';

/** Aggregate-level, one aggregate call each: the two formulas `roas` is built out of. */
const REVENUE_FORMULA = 'SUM({{ref field="amount"}})';
const COST_FORMULA = 'SUM({{ref field="bonus"}})';
/** Guarded division, the shape the formula editor's own autocomplete suggests. */
const ROAS_FORMULA = `{{ref field="${REVENUE}"}} / NULLIF({{ref field="${COST}"}}, 0)`;
/**
 * Row-level over row-level: A is a dimension because B is one. `UPPER` is scalar in all five
 * dialects, so no storage reads this as an aggregate and the level comes from the chain alone.
 */
const SESSION_UPPER_FORMULA = `UPPER({{ref field="${SESSION_KEY}"}})`;

/**
 * SUM(amount) / SUM(bonus) per channel: paid rows 1-3 → 60/6, organic rows 4-5 → 45/11. The two
 * ratios differ from each other by a factor of two and NEITHER equals the collapsed one below —
 * which is what makes the wrong answer visible. One group would prove nothing: the failure
 * is the whole report collapsing to a single row, and a single correct row would look the same.
 */
const ROAS_BY_CHANNEL: Record<string, number> = { paid: 60 / 6, organic: 45 / 11 };
/** SUM(amount)/SUM(bonus) over ALL five rows: 105/17. The number the collapse publishes. */
const ROAS_COLLAPSED = 105 / 17;
/** Rows behind each channel — the report's own COUNT(*), and the grain in one number. */
const ROW_COUNT_BY_CHANNEL: Record<string, number> = { paid: 3, organic: 2 };

/** UPPER(CONCAT(part_a, part_b)) per row: 3 distinct values over 5 rows, as `session_key` itself. */
const SESSION_UPPER_OF_EVERY_ROW = ['XYZ', 'XYZ', 'PQ', 'PQ', 'MN'];
/** SUM(amount) per UPPER(session_key): 10+20, 30+40, 5 — the same three groups, uppercased. */
const SUM_BY_SESSION_UPPER: Record<string, number> = { XYZ: 30, PQ: 70, MN: 5 };
const ROW_COUNT_BY_SESSION_UPPER: Record<string, number> = { XYZ: 2, PQ: 2, MN: 1 };

// ---------------------------------------------------------------------------
// Date bucketing and the declared-type cast, on a NINTH-row table
// of its own. Every number below is computed by hand from `BUCKET_SEED_ROWS` BEFORE the assertion
// that reads it, and each wrong reading this slice can produce is written down beside the right
// one — the failure this feature keeps producing is a plausible number, never an error.
//
// The table cannot be borrowed from the three above. It needs dates spanning three months, a
// nullable date so the formula's value differs from any single column's, numeric-looking STRINGS
// whose true sum has a fractional part, and a day-ambiguous `05/08/2026` — none of which the
// earlier fixtures carry. It joins the SAME `orders` mart, so it costs one table, not two.
// ---------------------------------------------------------------------------

interface BucketSeedRow {
  customer_id: string;
  /**
   * NULL on three rows, and that is what makes the COALESCE live: the formula's bucket then comes
   * from `fallback_date`, so bucketing the raw `event_date` instead publishes a NULL group and a
   * different number in every other group.
   */
  event_date: string | null;
  fallback_date: string;
  /**
   * `num_prefix ++ num_suffix` is a numeric-looking STRING; NEITHER half parses as a number on its
   * own, so no dialect can constant-fold the pair back into a numeric literal.
   */
  num_prefix: string;
  num_suffix: string;
  amount: number;
}

/**
 * `event_month` = COALESCE(event_date, fallback_date), bucketed to MONTH. Four properties, each
 * load-bearing:
 *   - three months over nine rows, all nine effective dates distinct, so the bucketed answer (3
 *     rows) and the unbucketed one (9) differ visibly — both are executed;
 *   - bucketing the RAW `event_date` gives four groups whose sums are 1/9/19/18 and bucketing the
 *     raw `fallback_date` gives 25/12/10 — no number of either reading equals 4, 14 or 29;
 *   - each bucket's distinct customer count (1, 2, 3) differs from every other bucket's, from its
 *     own row count (2, 3, 4), from the report-wide distinct count (4) and from the confident 0 a
 *     sleeve that dropped the truncation would publish;
 *   - a customer repeats WITHIN a bucket (c1 twice in May, c2 twice in September), so the sleeve's
 *     de-duplication is live rather than inert.
 */
const BUCKET_SEED_ROWS: readonly BucketSeedRow[] = [
  {
    customer_id: 'c1',
    event_date: '2026-08-05',
    fallback_date: '2026-05-14',
    num_prefix: '10.',
    num_suffix: '5',
    amount: 1,
  },
  {
    customer_id: 'c1',
    event_date: null,
    fallback_date: '2026-08-20',
    num_prefix: '2.',
    num_suffix: '25',
    amount: 3,
  },
  {
    customer_id: 'c1',
    event_date: null,
    fallback_date: '2026-05-14',
    num_prefix: '0.',
    num_suffix: '5',
    amount: 5,
  },
  {
    customer_id: 'c3',
    event_date: '2026-05-30',
    fallback_date: '2026-08-05',
    num_prefix: '1.',
    num_suffix: '25',
    amount: 7,
  },
  {
    customer_id: 'c1',
    event_date: '2026-05-22',
    fallback_date: '2026-08-05',
    num_prefix: '3.',
    num_suffix: '5',
    amount: 2,
  },
  {
    customer_id: 'c2',
    event_date: '2026-09-02',
    fallback_date: '2026-05-14',
    num_prefix: '0.',
    num_suffix: '25',
    amount: 9,
  },
  {
    customer_id: 'c4',
    event_date: null,
    fallback_date: '2026-09-27',
    num_prefix: '0.',
    num_suffix: '5',
    amount: 10,
  },
  {
    customer_id: 'c3',
    event_date: '2026-09-15',
    fallback_date: '2026-05-14',
    num_prefix: '1.',
    num_suffix: '25',
    amount: 4,
  },
  {
    customer_id: 'c2',
    event_date: '2026-09-08',
    fallback_date: '2026-05-14',
    num_prefix: '0.',
    num_suffix: '25',
    amount: 6,
  },
];

/** Constant on every row: `05/08/2026` reads as 5 August (DMY) AND as 8 May (MDY). */
const AMBIGUOUS_PREFIX = '05/';
const AMBIGUOUS_SUFFIX = '08/2026';
/**
 * The probe's zone, and the one that made Snowflake return a value where it otherwise refused —
 * `2026-05` for a formula meaning `2026-08`. The whole leg is refused now, so the wrong
 * month is a comment on the test rather than a constant an assertion still compares against.
 */
const AMBIGUOUS_TIME_ZONE = 'America/New_York';
/** `1` followed by thirty zeros — past NUMERIC(38,9)'s ~1e29 and DECIMAL(38,18)'s ~1e20 alike. */
const BIG_PREFIX = '1';
const BIG_SUFFIX = '0'.repeat(30);
const BIG_VALUE_TRUE_SUM = 9e30;

interface BucketGroup {
  /** SUM(amount) over the bucket's rows. */
  amount: number;
  /** Rows behind it — equal to COUNT, which the distinct count must not be. */
  rowCount: number;
  /** COUNT_DISTINCT over the JOINED `orders.customer_id` the bucket's rows reach. */
  distinctCustomers: number;
}

/**
 *   2026-05  rows 3,4,5  amount 5+7+2   customers c1,c3,c1 → 2 distinct
 *   2026-08  rows 1,2    amount 1+3     customers c1,c1    → 1 distinct
 *   2026-09  rows 6,7,8,9 amount 9+10+4+6 customers c2,c4,c3,c2 → 3 distinct
 */
const BUCKET_GROUPS: Record<string, BucketGroup> = {
  '2026-05': { amount: 14, rowCount: 3, distinctCustomers: 2 },
  '2026-08': { amount: 4, rowCount: 2, distinctCustomers: 1 },
  '2026-09': { amount: 29, rowCount: 4, distinctCustomers: 3 },
};

const BUCKET_SOURCE_ROW_COUNT = 9;
/** All nine effective dates are distinct, so the UNBUCKETED twin of the same report has nine rows. */
const BUCKET_DISTINCT_EFFECTIVE_DATES = 9;
const BUCKET_GRAND_TOTAL_AMOUNT = 47;

/** SUM(amount) per MONTH of the RAW `event_date` — the reading that ignores the COALESCE. */
const BUCKET_AMOUNTS_BY_RAW_EVENT_DATE = [1, 9, 19, 18];
/** And per month of the raw `fallback_date`, the other half of the same formula. */
const BUCKET_AMOUNTS_BY_RAW_FALLBACK_DATE = [25, 12, 10];
/** Distinct customers over the whole table — {c1, c2, c3, c4}. Distinct counts do not add up. */
const BUCKET_REPORT_WIDE_DISTINCT_CUSTOMERS = 4;
const BUCKET_SUM_OF_GROUP_DISTINCTS = 6;
/**
 * A sleeve that projected the formula UNTRUNCATED never reaches a warehouse — the membership
 * assertion catches it first. MEASURED with that assertion ALSO out of the way: BigQuery answered
 * `1` for May, where 2 is correct. The join-back is applied per ROW, before the outer GROUP BY, so
 * an untruncated predicate still matches each row against its own sleeve row and `ANY_VALUE` hands
 * every bucket a count computed at the RAW-DATE grain. 0 is the OTHER reading of the same miss —
 * the one `abstract-blended-query-builder.ts` names, where the join-back matches no row at all and
 * the counting pull COALESCEs it. Both are numbers; neither is a NULL, and neither is an error.
 */
const SLEEVE_MISS_DISTINCT_COUNT = 0;

/** SUM over the nine numeric strings, added as the decimals they spell. */
const NUMERIC_STRING_TRUE_SUM = 20.25;
/**
 * The same nine, each coerced to `Decimal` at SCALE 0 before summing — what Redshift published
 * for this shape until the cast stated the scale, and what BigQuery and Athena refused outright.
 */
const NUMERIC_STRING_TRUNCATED_SUM = 17;

/**
 * Ten significant digits, and exactly representable in a 64-bit float — so a cast target that is
 * 32 bits wide changes this number and nothing else can. The 32-bit exception exists for exactly that:
 * `REAL` on Athena and Redshift and `FLOAT` on Databricks are each the FAITHFUL name for a declared
 * float and each would round an expression that already computes in 64 bits to about seven digits.
 * The three dialects that have such a spelling declare it here; the other two have none to declare.
 */
const WIDE_MULTIPLIER = 123456789.5;
/** `SUM(amount) * 123456789.5` = 47 × the multiplier, computed by hand and exact in float64. */
const WIDE_FLOAT_TRUE_SUM = 5802469106.5;

/** `amount * 0.5` per row: .5 on five of nine rows, so the true total cannot be an integer. */
const HALF_TRUE_SUM = 23.5;
/** Cast to an integer PER ROW first, the way the four rounding dialects would. */
const HALF_SUM_IF_ROUNDED_PER_ROW = 26;
/** And the way Spark would — the disagreement the integer rule is about. */
const HALF_SUM_IF_TRUNCATED_PER_ROW = 21;

const EVENT_MONTH = 'event_month';
const NUM_FLOAT = 'num_float';
const WIDE_FLOAT = 'wide_float';
const NUM_INT = 'num_int';
const HALF_FLOAT = 'half_float';
const HALF_INT = 'half_int';
const BIG_FLOAT = 'big_float';
const BIG_EXACT = 'big_exact';
const AMBIGUOUS_TS = 'ambiguous_ts';
/** One field per exact-decimal spelling the dialect has — Redshift and BigQuery each have two. */
const exactFieldName = (index: number): string => `num_exact_${index}`;

const ORDERS_CUSTOMER_ID_COUNT_DISTINCT = `${ORDERS_CUSTOMER_ID} | COUNTUNIQUE`;

/**
 * The QUIET shape of the joined-calculated refusal. `ctr` is a real DOUBLE column of the `orders` TABLE, and a SECOND Data
 * Mart over that same table declares a calculated field of the same name — the "formula named
 * after a column since added" configuration. A report joining that mart and selecting the field
 * composes VALID SQL that serves these numbers in place of the formula's, which is why the refusal
 * has to be a refusal rather than a warehouse error.
 */
const ORDER_CTR_BY_CUSTOMER: Record<string, number> = Object.fromEntries(
  ORDER_ROWS.map(row => [row.customer_id, row.ctr])
);
const JOINED_CTR = `${ORDERS_ALIAS}__ctr`;
/** `revenue * 2` — 200 / 22 / 60 / 14, none of which is any customer's physical `ctr`. */
const ORDERS_CTR_FORMULA = '{{ref field="revenue"}} * 2';
const ORDERS_CTR_FORMULA_BY_CUSTOMER: Record<string, number> = Object.fromEntries(
  ORDER_ROWS.map(row => [row.customer_id, row.revenue * 2])
);

// ---------------------------------------------------------------------------
// FILTERS on a Calculated Field, on an EIGHT-row table of its own.
//
// Every number below is computed by hand from `FILTER_SEED_ROWS` before the assertion that reads
// it, and each WRONG reading this slice can produce is written down beside the right one — the
// failure this feature keeps producing is a plausible number, never an error.
//
// The table cannot be borrowed from the four above. It needs, in one row set: two groups whose
// JOINED distinct counts move visibly under a row-level predicate AND differ from each other, from
// their own row counts and from the unfiltered pair; an aggregate-level measure whose HAVING keeps
// the group with the SMALLER main total (so a predicate that silently compared the wrong column
// keeps the OTHER group); the probe's `'9' / '10' / '100'` text, whose `> 5` answer is 3 rows
// numerically and exactly 1 lexicographically; an honest DATE beside a mis-declared ISO STRING;
// one unparseable numeric row beside a NULL one; the day-ambiguous `05/08/2026`; and a timestamp
// inside a relative-date window. It joins the SAME `orders` mart, so it costs one table, not two.
// ---------------------------------------------------------------------------

interface FilterSeedRow {
  grp: string;
  customer_id: string;
  /** `filter_key` = ka ++ kb. Rows 1/2 and 5/6 pair DIFFERENT inputs onto the SAME key. */
  ka: string;
  kb: string;
  amount: number;
  /** The aggregate-level formula's input, deliberately ranked OPPOSITE to `amount` per group. */
  bonus: number;
  /** `num_text` = n_prefix ++ n_suffix — the probe's headline values. */
  n_prefix: string;
  n_suffix: string;
  /** `spelled_num` = sp_prefix ++ sp_suffix — the NON-canonical spelling nothing had tested. */
  sp_prefix: string;
  sp_suffix: string;
  /** `bad_num` — one NULL row (for `IS NULL`) and one unparseable row (for the declared-type cast). */
  bad_prefix: string | null;
  bad_suffix: string;
  /** `iso_date` = iso_prefix ++ iso_suffix — a STRING formula declared DATE. */
  iso_prefix: string;
  iso_suffix: string;
  /** `honest_date` = COALESCE(date_a, date_b) — a formula that genuinely returns a DATE. */
  date_a: string | null;
  date_b: string;
  /** `recent_ts` = COALESCE(ts_a, ts_b); ts_b is the same far-past constant on every row. */
  ts_a: string | null;
}

/**
 * Midnight UTC of YESTERDAY, and midnight rather than "now" on purpose: only BigQuery wraps a
 * relative-date left-hand side in `DATE(...)`, so on the other four the predicate compares a
 * TIMESTAMP against `CURRENT_DATE`, which is that day's midnight — a value seeded at noon would
 * fail `<= CURRENT_DATE` on four dialects for reasons that have nothing to do with this slice.
 * Yesterday rather than today so a session time zone up to a day either side of UTC (Snowflake
 * defaults to America/Los_Angeles) cannot push the row out of the window.
 */
const RECENT_TIMESTAMP = `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)} 00:00:00`;
/** Wide enough that neither the seeded day nor any session's `CURRENT_DATE` can fall outside it. */
const RELATIVE_DATE_WINDOW_DAYS = 3;
/** The other eight rows' timestamp — far outside any relative-date window this suite asks for. */
const DISTANT_TIMESTAMP = '2020-01-01 00:00:00';

const FILTER_SEED_ROWS: readonly FilterSeedRow[] = [
  {
    grp: 'g1',
    customer_id: 'c1',
    ka: 'p',
    kb: 'qr',
    amount: 10,
    bonus: 1,
    n_prefix: '9',
    n_suffix: '',
    sp_prefix: '9',
    sp_suffix: '.0',
    bad_prefix: '1.',
    bad_suffix: '5',
    iso_prefix: '2026-',
    iso_suffix: '07-15',
    date_a: null,
    date_b: '2026-07-20',
    ts_a: RECENT_TIMESTAMP,
  },
  {
    grp: 'g1',
    customer_id: 'c2',
    ka: 'pq',
    kb: 'r',
    amount: 20,
    bonus: 2,
    n_prefix: '1',
    n_suffix: '0',
    sp_prefix: '1',
    sp_suffix: '.0',
    bad_prefix: '2.',
    bad_suffix: '5',
    iso_prefix: '2026-',
    iso_suffix: '06-30',
    date_a: '2026-08-20',
    date_b: '2026-05-14',
    ts_a: null,
  },
  {
    grp: 'g1',
    customer_id: 'c1',
    ka: 'p',
    kb: 'qr',
    amount: 30,
    bonus: 3,
    n_prefix: '10',
    n_suffix: '0',
    sp_prefix: '2',
    sp_suffix: '.0',
    bad_prefix: null,
    bad_suffix: '5',
    iso_prefix: '2026-',
    iso_suffix: '08-05',
    date_a: null,
    date_b: '2026-09-27',
    ts_a: null,
  },
  {
    grp: 'g1',
    customer_id: 'c3',
    ka: 'x',
    kb: 'yz',
    amount: 40,
    bonus: 4,
    n_prefix: '2.',
    n_suffix: '5',
    sp_prefix: '3',
    sp_suffix: '.0',
    bad_prefix: '3.',
    bad_suffix: '5',
    iso_prefix: '2026-',
    iso_suffix: '05-14',
    date_a: '2026-07-02',
    date_b: '2026-05-14',
    ts_a: null,
  },
  {
    grp: 'g2',
    customer_id: 'c4',
    ka: 'p',
    kb: 'qr',
    amount: 5,
    bonus: 20,
    n_prefix: '3.',
    n_suffix: '5',
    sp_prefix: '4',
    sp_suffix: '.0',
    bad_prefix: 'ab',
    bad_suffix: 'c',
    iso_prefix: '2026-',
    iso_suffix: '09-02',
    date_a: null,
    date_b: '2026-06-11',
    ts_a: null,
  },
  {
    grp: 'g2',
    customer_id: 'c4',
    ka: 'pq',
    kb: 'r',
    amount: 6,
    bonus: 30,
    n_prefix: '0.',
    n_suffix: '5',
    sp_prefix: '5',
    sp_suffix: '.0',
    bad_prefix: '4.',
    bad_suffix: '5',
    iso_prefix: '2026-',
    iso_suffix: '04-01',
    date_a: '2026-09-15',
    date_b: '2026-05-14',
    ts_a: null,
  },
  {
    grp: 'g2',
    customer_id: 'c2',
    ka: 'x',
    kb: 'yz',
    amount: 7,
    bonus: 40,
    n_prefix: '1.',
    n_suffix: '75',
    sp_prefix: '6',
    sp_suffix: '.0',
    bad_prefix: '5.',
    bad_suffix: '5',
    iso_prefix: '2026-',
    iso_suffix: '07-01',
    date_a: null,
    date_b: '2026-03-08',
    ts_a: null,
  },
  {
    grp: 'g2',
    customer_id: 'c3',
    ka: 'r',
    kb: 's',
    amount: 8,
    bonus: 50,
    n_prefix: '4.',
    n_suffix: '25',
    sp_prefix: '7',
    sp_suffix: '.0',
    bad_prefix: '6.',
    bad_suffix: '5',
    iso_prefix: '2026-',
    iso_suffix: '02-20',
    date_a: '2026-08-01',
    date_b: '2026-05-14',
    ts_a: null,
  },
];

const FILTER_SOURCE_ROW_COUNT = 8;

const FILTER_GRP = 'grp';
const FILTER_KEY = 'filter_key';
const FILTER_BONUS_TOTAL = 'bonus_total';
const FILTER_NUM = 'num_text';
const FILTER_SPELLED = 'spelled_num';
const FILTER_BAD = 'bad_num';
const FILTER_HONEST_DATE = 'honest_date';
const FILTER_ISO_DATE = 'iso_date';
const FILTER_AMB_DATE = 'amb_date';
const FILTER_RECENT_TS = 'recent_ts';
const FILTER_AMB_DATE_MIN = `${FILTER_AMB_DATE} | MIN`;

/** The row-level predicate every blended assertion below is built on. */
const FILTER_KEY_VALUE = 'pqr';

/** `ka ++ kb` per row: pqr, pqr, pqr, xyz, pqr, pqr, xyz, rs — 3 distinct over 8 rows. */
const FILTER_KEYS_OF_EVERY_ROW = ['pqr', 'pqr', 'pqr', 'xyz', 'pqr', 'pqr', 'xyz', 'rs'];
/** `filter_key = 'pqr'` keeps rows 1, 2, 3, 5, 6 — five of the eight. */
const FILTER_KEPT_AMOUNTS = [5, 6, 10, 20, 30];
/** And drops these three, so a predicate that never reached the warehouse is visible at once. */
const FILTER_DROPPED_AMOUNTS = [7, 8, 40];
/**
 * Rows 2 and 6 carry `ka = 'pq'`, `kb = 'r'` — they reach 'pqr' only through the EXPRESSION. A
 * predicate applied to the columns the formula mentions (`ka = 'p' AND kb = 'qr'`) keeps rows
 * 1, 3, 5 and loses exactly these two amounts.
 */
const FILTER_EXPRESSION_ONLY_AMOUNTS = [6, 20];

/** SUM(amount) over the whole table and over the kept rows: 126 and 10+20+30+5+6. */
const FILTER_GRAND_TOTAL_AMOUNT = 126;
const FILTER_KEPT_TOTAL_AMOUNT = 71;

interface FilterGroup {
  /** COUNT_DISTINCT over the JOINED `orders.customer_id` the group's rows reach. */
  distinctCustomers: number;
  /** SUM over the DISTINCT orders those rows reach. */
  revenue: number;
  /** SUM(amount) over the group's rows. */
  amount: number;
  /** Rows behind the group — equal to a COUNT that lost its DISTINCT. */
  rowCount: number;
  /** The joined revenue a sleeve that did NOT de-duplicate would publish. */
  revenueWithoutDedup: number;
}

/**
 * Under `filter_key = 'pqr'`, at the `grp` grain. Orders are c1=100, c2=11, c3=30, c4=7.
 *   g1  rows 1,2,3  customers c1,c2,c1 → 2 distinct, 100+11 = 111 (c1 twice: dedup live)
 *   g2  rows 5,6    customers c4,c4    → 1 distinct, 7          (c4 twice: dedup live)
 */
const FILTER_GROUPS_FILTERED: Record<string, FilterGroup> = {
  g1: { distinctCustomers: 2, revenue: 111, amount: 60, rowCount: 3, revenueWithoutDedup: 211 },
  g2: { distinctCustomers: 1, revenue: 7, amount: 11, rowCount: 2, revenueWithoutDedup: 14 },
};

/**
 * The SAME report with no filter — executed rather than asserted from a constant, because it is
 * the exact number a sleeve that never received the predicate publishes.
 *   g1  rows 1-4  c1,c2,c1,c3 → 3 distinct, 100+11+30 = 141
 *   g2  rows 5-8  c4,c4,c2,c3 → 3 distinct, 7+11+30   = 48
 */
const FILTER_GROUPS_UNFILTERED: Record<string, FilterGroup> = {
  g1: { distinctCustomers: 3, revenue: 141, amount: 100, rowCount: 4, revenueWithoutDedup: 241 },
  g2: { distinctCustomers: 3, revenue: 48, amount: 26, rowCount: 4, revenueWithoutDedup: 55 },
};

/** Distinct customers over ALL the kept rows — {c1, c2, c4}. Neither group's answer, and not 3. */
const FILTER_KEPT_REPORT_WIDE_DISTINCT = 3;
/** And over all eight — {c1, c2, c3, c4}. Neither group's unfiltered answer either. */
const FILTER_UNFILTERED_REPORT_WIDE_DISTINCT = 4;
/** SUM over the DISTINCT orders the kept rows reach: 100 + 11 + 7. Totals must publish this. */
const FILTER_KEPT_REVENUE_TOTAL = 118;
/** The joined mart's own total, which an unfiltered Totals block would show instead. */
const FILTER_UNFILTERED_REVENUE_TOTAL = 148;

/**
 * `bonus_total = SUM(bonus)` per group: g1 1+2+3+4, g2 20+30+40+50. Ranked OPPOSITE to `amount`
 * (g1 100, g2 26) on purpose — `bonus_total > 50` keeps g2, and a predicate that had silently
 * compared the report's own `SUM(amount)` against the same threshold keeps g1 instead. The two
 * mistakes therefore return DIFFERENT groups rather than the same one.
 */
const FILTER_BONUS_BY_GROUP: Record<string, number> = { g1: 10, g2: 140 };
const FILTER_BONUS_THRESHOLD = 50;
const FILTER_HAVING_KEPT_GROUP = 'g2';
/** Totals over the ROWS of the kept group: SUM(amount) 26 and SUM(bonus) 140. Not 126 and 150. */
const FILTER_HAVING_KEPT_AMOUNT = 26;
const FILTER_HAVING_KEPT_BONUS = 140;
const FILTER_GRAND_TOTAL_BONUS = 150;

/**
 * The payoff of comparing by declared type. `num_text` returns `'9'`, `'10'`, `'100'`, `'2.5'`, `'3.5'`, `'0.5'`, `'1.75'`,
 * `'4.25'`; `> 5` is THREE rows read as numbers and EXACTLY ONE read as text, because `'9' > '5'`
 * is the only true lexicographic comparison in the set. Redshift published that one row — a
 * plausible report missing its two largest values, no error and no NULL.
 */
const FILTER_NUM_VALUES = ['9', '10', '100', '2.5', '3.5', '0.5', '1.75', '4.25'];
const FILTER_NUM_THRESHOLD = 5;
const FILTER_NUM_ABOVE_THRESHOLD = ['10', '100', '9'];
const FILTER_NUM_LEXICOGRAPHIC_ANSWER = ['9'];
/** SUM(amount) over the three rows `> 5` keeps: 10 + 20 + 30. */
const FILTER_NUM_ABOVE_AMOUNT = 60;

/** `= 10` and `= '10'` over the same field must now BOTH return this one row. */
const FILTER_NUM_EQUALITY_VALUE = '10';
const FILTER_NUM_EQUALITY_AMOUNT = 20;

/** The cheapest unmeasured cell: `'9.0' = 9` is TRUE numerically and FALSE as text. */
const FILTER_SPELLED_MATCH = '9.0';
const FILTER_SPELLED_MATCH_AMOUNT = 10;

/** `bad_num` is NULL on exactly one row (row 3) and unparseable on exactly one other (row 5). */
const FILTER_BAD_NULL_AMOUNT = 30;
const FILTER_BAD_NOT_NULL_ROWS = 7;
/** What the comparison would return if a dialect tolerated `'abc'`: the rows 5.5 and 6.5. */
const FILTER_BAD_ABOVE_THRESHOLD_ROWS = 2;

/**
 * The load-bearing claim, on a formula that genuinely returns a DATE.
 * `honest_date = COALESCE(date_a, date_b)`: 07-20, 08-20, 09-27, 07-02, 06-11, 09-15, 03-08, 08-01.
 * `BETWEEN '2026-07-01' AND '2026-08-31'` keeps rows 1, 2, 4, 8.
 */
const FILTER_DATE_FROM = '2026-07-01';
const FILTER_DATE_TO = '2026-08-31';
const FILTER_HONEST_DATE_AMOUNTS = [8, 10, 20, 40];
/** Reading `date_a` alone loses row 1 (its `date_a` is NULL); reading `date_b` alone keeps only it. */
const FILTER_HONEST_DATE_A_ONLY_AMOUNTS = [8, 20, 40];
const FILTER_HONEST_DATE_B_ONLY_AMOUNTS = [10];

/**
 * The same range over the MIS-DECLARED ISO string: 07-15, 06-30, 08-05, 05-14, 09-02, 04-01,
 * 07-01, 02-20 — rows 1, 3 and 7. Redshift answers this correctly for the WRONG reason
 * (lexicographic and chronological order coincide on ISO); BigQuery and Athena now refuse it.
 */
const FILTER_ISO_DATE_AMOUNTS = [7, 10, 30];

/** Two groups, so a HAVING that kept everything and one that kept nothing cannot be confused. */
const FILTER_GROUP_KEYS = ['g1', 'g2'];

/**
 * `relative_date` over `recent_ts`: exactly one row sits inside the window, the other seven are
 * pinned to 2020. BigQuery is the dialect the left-hand side changed on (`DATE((formula))`).
 */
const FILTER_RECENT_ROW_AMOUNT = 10;

// ---------------------------------------------------------------------------
// Credential gates — one per storage.
//
// Spelled `<STORAGE>_AVAILABLE`, deliberately NOT the `*_CREDENTIALS_AVAILABLE` name the
// single-storage suites use: `integration-credential-gate.spec.ts` parses ONE such predicate per
// file, and this file holds five. The variables themselves are already covered by that gate through
// the per-storage suites, so CI still hard-fails on a missing secret rather than skipping green.
// ---------------------------------------------------------------------------

const BQ_SERVICE_ACCOUNT_KEY = process.env.BQ_SERVICE_ACCOUNT_KEY;
const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID;
const BQ_DATASET = process.env.BQ_DATASET;
const BQ_AVAILABLE = !!(BQ_SERVICE_ACCOUNT_KEY && BQ_PROJECT_ID && BQ_DATASET);

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const ATHENA_REGION = process.env.ATHENA_REGION;
const ATHENA_OUTPUT_BUCKET = process.env.ATHENA_OUTPUT_BUCKET;
const ATHENA_DATABASE = process.env.ATHENA_DATABASE;
const ATHENA_AVAILABLE = !!(
  AWS_ACCESS_KEY_ID &&
  AWS_SECRET_ACCESS_KEY &&
  ATHENA_REGION &&
  ATHENA_OUTPUT_BUCKET &&
  ATHENA_DATABASE
);

const REDSHIFT_REGION = process.env.REDSHIFT_REGION;
const REDSHIFT_WORKGROUP_NAME = process.env.REDSHIFT_WORKGROUP_NAME;
const REDSHIFT_DATABASE = process.env.REDSHIFT_DATABASE;
const REDSHIFT_AVAILABLE = !!(
  AWS_ACCESS_KEY_ID &&
  AWS_SECRET_ACCESS_KEY &&
  REDSHIFT_REGION &&
  REDSHIFT_WORKGROUP_NAME &&
  REDSHIFT_DATABASE
);

const SNOWFLAKE_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT;
const SNOWFLAKE_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE;
const SNOWFLAKE_USERNAME = process.env.SNOWFLAKE_USERNAME;
const SNOWFLAKE_PASSWORD = process.env.SNOWFLAKE_PASSWORD;
const SNOWFLAKE_DATABASE = process.env.SNOWFLAKE_DATABASE;
const SNOWFLAKE_SCHEMA = process.env.SNOWFLAKE_SCHEMA;
const SNOWFLAKE_AVAILABLE = !!(
  SNOWFLAKE_ACCOUNT &&
  SNOWFLAKE_WAREHOUSE &&
  SNOWFLAKE_USERNAME &&
  SNOWFLAKE_PASSWORD &&
  SNOWFLAKE_DATABASE &&
  SNOWFLAKE_SCHEMA
);

const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_HTTP_PATH = process.env.DATABRICKS_HTTP_PATH;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_CATALOG = process.env.DATABRICKS_CATALOG;
const DATABRICKS_SCHEMA = process.env.DATABRICKS_SCHEMA;
const DATABRICKS_AVAILABLE = !!(
  DATABRICKS_HOST &&
  DATABRICKS_HTTP_PATH &&
  DATABRICKS_TOKEN &&
  DATABRICKS_CATALOG &&
  DATABRICKS_SCHEMA
);

const ANY_STORAGE_AVAILABLE =
  BQ_AVAILABLE ||
  ATHENA_AVAILABLE ||
  REDSHIFT_AVAILABLE ||
  SNOWFLAKE_AVAILABLE ||
  DATABRICKS_AVAILABLE;

if (!ANY_STORAGE_AVAILABLE) {
  console.log('Skipping row-level calculated field integration tests: no storage credentials set');
}

// ---------------------------------------------------------------------------
// Shared NestJS app — ONE instance for the whole file. createTestApp() must not
// be called twice in a worker process (TypeORM DataSource singleton conflict),
// so every storage block shares this one.
// ---------------------------------------------------------------------------

let app: INestApplication;
let agent: supertest.Agent;
let composer: ReportSqlComposerService;
let blendedReportData: BlendedReportDataService;
let totalsService: ReportTotalsService;
let validator: OutputControlsValidatorService;
let dataMartService: DataMartService;
let readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>;

// NullIdpProvider (used by createTestApp) authenticates `test-token` as userId '0', projectId '0',
// roles ['admin'] — what resolveBlendableSchemaAccessor produces on the real run path.
const NULL_IDP_PROJECT_ID = '0';
const ACCESSOR: BlendableSchemaAccessor = { userId: '0', roles: ['admin'] };

if (ANY_STORAGE_AVAILABLE) {
  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    composer = app.get(ReportSqlComposerService);
    blendedReportData = app.get(BlendedReportDataService);
    totalsService = app.get(ReportTotalsService);
    validator = app.get(OutputControlsValidatorService);
    dataMartService = app.get(DataMartService);
    readerResolver = app.get(DATA_STORAGE_REPORT_READER_RESOLVER);
  }, 180000);

  afterAll(async () => {
    if (app) {
      await closeTestApp(app);
    }
  }, 60000);
}

// ---------------------------------------------------------------------------
// One storage's seeding + provisioning contract.
// ---------------------------------------------------------------------------

interface StorageCase {
  label: string;
  storageType: DataStorageType;
  available: boolean;
  /** `type` for POST /api/data-storages, and the config/credentials the PUT expects. */
  storageApiType: string;
  storageConfig: () => Record<string, unknown>;
  storageCredentials: () => Record<string, unknown>;
  /** The mart's TABLE definition, in this storage's own fully-qualified spelling. */
  fullyQualifiedName: () => string;
  /** Same, for the joined `orders` mart. */
  ordersFullyQualifiedName: () => string;
  /** Same, for the eight-row table the aggregated report reads. */
  aggFullyQualifiedName: () => string;
  /** Same, for the nine-row table the dates and numeric strings live in. */
  bucketFullyQualifiedName: () => string;
  /** Same, for the eight-row table the FILTERS run against. */
  filterFullyQualifiedName: () => string;
  /**
   * The ROW-LEVEL formula, in this dialect's own spelling. Redshift's CONCAT takes exactly two
   * arguments and `||` is its idiomatic concatenation, so it gets a genuinely different expression
   * to execute — which is the storage axis this suite exists to cover.
   */
  rowLevelFormula: string;
  /** The same difference, applied to the four string-pair formulas. */
  concat: (left: string, right: string) => string;
  /**
   * This dialect's own spellings for the three declared-type families. The cast
   * targets they resolve to differ per dialect (`FLOAT64`, `DOUBLE`, `NUMERIC(38,18)`, …) and are
   * pinned per dialect in unit tests; what is executed here is the NUMBER each one produces.
   */
  floatType: string;
  /**
   * The dialect's 32-BIT float spelling, which is deliberately NOT a cast target — `REAL` on
   * Athena and Redshift, `FLOAT` on Databricks. BigQuery and Snowflake have none, so they declare
   * their ordinary float and the same assertion measures a ten-digit value surviving there too.
   */
  narrowFloatType: string;
  /** Every exact-decimal spelling the dialect has — two on Redshift and on BigQuery. */
  exactTypes: readonly string[];
  integerType: string;
  /**
   * `SUM` over an INTEGER-declared formula returning numeric TEXT — status quo, because the integer rule
   * excludes the integer family from the cast. `'error'` on the two dialects that refuse text to
   * `SUM` outright; `NUMERIC_STRING_TRUNCATED_SUM` on Redshift, which coerces at scale 0; the true
   * total on the two that coerce faithfully. This is the one named COST, measured.
   */
  integerOverTextSum: number | 'error';
  /**
   * A DATE-declared formula returning an ISO STRING, filtered by a range.
   * `'error'` on the two dialects that refuse `varchar >= date` outright — which is a CHANGE:
   * before the declaration reached the filter's type resolver they emitted no cast, compared two
   * strings and returned the right rows for the wrong reason. `'rows'` where the comparison runs:
   * Redshift emits no cast at all and is lexicographic (right, on ISO values, by coincidence),
   * Snowflake and Databricks coerce the string to a real DATE and parse ISO faithfully.
   */
  misdeclaredIsoDateRange: 'error' | 'rows';
  /**
   * `MIN(<DATE-declared string formula>) >= <threshold>` — the function-carrying HAVING,
   * measured against the day-ambiguous `05/08/2026` at TWO thresholds so the three readings
   * separate: `'error'` (BigQuery/Athena refuse the operand pair, Databricks refuses the value at
   * cast time), `'lexicographic'` (Redshift: `'0' < '2'`, so NO group clears either threshold), and
   * `'date-mdy'` (Snowflake: a real DATE comparison that reads the string as 8 May, so every group
   * clears 2026-01-01 and none clears 2026-06-01 — where the formula means 5 August and all should
   * clear both).
   */
  functionDateHaving: 'error' | 'lexicographic' | 'date-mdy';
  /**
   * A comparison on a FLOAT-declared formula whose data holds ONE unparseable row — explicitly
   * unmeasured, since the probe's fixture was all numeric-looking. `'error'` is the
   * PREDICTION for all five, and it is the whole cost of comparing by declared type: a report that used to come back
   * wrong now does not come back at all. `'rows'` would mean the dialect answered NULL for the bad
   * row and kept the other two, which is one ANSI setting away on Databricks and is why this is a
   * per-dialect fact rather than a shared assertion.
   */
  unparseableComparison: 'error' | 'rows';
  /**
   * BigQuery alone reads the declared type in `renderRelativeDate` and wraps a sub-day left-hand
   * side in `DATE(...)`. The other four compare the raw TIMESTAMP against
   * `CURRENT_DATE` arithmetic, which is why the fixture seeds a MIDNIGHT value.
   */
  relativeDateWrapsDate: boolean;
  /** Creates the connection, pre-drops a leftover table, creates and fills the seed table. */
  seed: () => Promise<void>;
  /** Drops the seed table and releases the connection. Never throws. */
  teardown: () => Promise<void>;
}

const REF_PART_A = '{{ref field="part_a"}}';
const REF_PART_B = '{{ref field="part_b"}}';
const CONCAT_FORMULA = `CONCAT(${REF_PART_A}, ${REF_PART_B})`;
const PIPES_FORMULA = `${REF_PART_A} || ${REF_PART_B}`;

/** Aggregate-level, and guarded — the shape the formula editor's own autocomplete suggests. */
const BONUS_RATE_FORMULA = 'SUM({{ref field="bonus"}}) / NULLIF(SUM({{ref field="amount"}}), 0)';

const TABLE_SUFFIX = `rlcf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const ORDERS_TABLE_SUFFIX = `${TABLE_SUFFIX}_orders`;
const AGG_TABLE_SUFFIX = `${TABLE_SUFFIX}_agg`;
const BUCKET_TABLE_SUFFIX = `${TABLE_SUFFIX}_bkt`;
const FILTER_TABLE_SUFFIX = `${TABLE_SUFFIX}_flt`;

/** `CONCAT(a, b)` on four dialects; Redshift's CONCAT is strictly binary and its idiom is `||`. */
const concatOf = (left: string, right: string): string => `CONCAT(${left}, ${right})`;
const pipesOf = (left: string, right: string): string => `${left} || ${right}`;

const REF = (field: string): string => `{{ref field="${field}"}}`;
/** The formula whose value differs from BOTH of the columns it reads — see `BUCKET_SEED_ROWS`. */
const EVENT_MONTH_FORMULA = `COALESCE(${REF('event_date')}, ${REF('fallback_date')})`;
/** Halves an even and an odd amount alike, so five of the nine per-row values end in .5. */
const HALF_FORMULA = `${REF('amount')} * 0.5`;
/** Ten significant digits per row — the only shape a 32-bit cast target can be seen through. */
const WIDE_FLOAT_FORMULA = `${REF('amount')} * ${WIDE_MULTIPLIER}`;

/** A DATE literal every one of the five dialects parses, NULL included. */
const dateLiteral = (value: string | null): string =>
  value === null ? 'CAST(NULL AS DATE)' : `DATE '${value}'`;

/**
 * The same, for a TIMESTAMP. Spelled as a CAST rather than as `TIMESTAMP '…'` because that is the
 * one form all five accept: Snowflake's typed-literal support for it is version-dependent, and a
 * CAST costs nothing at seed time.
 */
const timestampLiteral = (value: string | null): string =>
  value === null ? 'CAST(NULL AS TIMESTAMP)' : `CAST('${value}' AS TIMESTAMP)`;

/**
 * A text literal, NULL included, cast to the dialect's own string type. `bad_prefix` is NULL on
 * one row so `IS NULL` has something to find, and a BARE `NULL` inside Athena's `VALUES` leaves
 * the column type unknown — the CAST is what every dialect needs anyway, so it is uniform here.
 */
const textLiteral = (value: string | null, textType: string): string =>
  `CAST(${value === null ? 'NULL' : `'${value}'`} AS ${textType})`;

/** The filter fixture's columns, in the one order every seed and every INSERT below uses. */
const FILTER_COLUMN_NAMES: readonly string[] = [
  'grp',
  'customer_id',
  'ka',
  'kb',
  'amount',
  'bonus',
  'n_prefix',
  'n_suffix',
  'sp_prefix',
  'sp_suffix',
  'bad_prefix',
  'bad_suffix',
  'iso_prefix',
  'iso_suffix',
  'date_a',
  'date_b',
  'amb_prefix',
  'amb_suffix',
  'ts_a',
  'ts_b',
];

/** The same list as an INSERT column list. Snowflake needs each name quoted and lowercase. */
const filterColumnList = (quote: (name: string) => string = n => n): string =>
  FILTER_COLUMN_NAMES.map(quote).join(', ');

/** One seed row as a `VALUES` tuple, in the dialect's own string-type spelling. */
const filterRowValues = (row: FilterSeedRow, textType: string): string => {
  const txt = (value: string | null): string => textLiteral(value, textType);
  return (
    `(${txt(row.grp)}, ${txt(row.customer_id)}, ${txt(row.ka)}, ${txt(row.kb)}, ` +
    `${row.amount}, ${row.bonus}, ${txt(row.n_prefix)}, ${txt(row.n_suffix)}, ` +
    `${txt(row.sp_prefix)}, ${txt(row.sp_suffix)}, ${txt(row.bad_prefix)}, ` +
    `${txt(row.bad_suffix)}, ${txt(row.iso_prefix)}, ${txt(row.iso_suffix)}, ` +
    `${dateLiteral(row.date_a)}, ${dateLiteral(row.date_b)}, ` +
    `${txt(AMBIGUOUS_PREFIX)}, ${txt(AMBIGUOUS_SUFFIX)}, ` +
    `${timestampLiteral(row.ts_a)}, ${timestampLiteral(DISTANT_TIMESTAMP)})`
  );
};

/** The filter fixture's DDL, given the dialect's string and floating-point column spellings. */
const filterTableColumns = (
  textType: string,
  floatType: string,
  quote: (name: string) => string = n => n
): string => {
  const typeOf = (name: string): string => {
    if (name === 'amount' || name === 'bonus') return floatType;
    if (name === 'date_a' || name === 'date_b') return 'DATE';
    if (name === 'ts_a' || name === 'ts_b') return 'TIMESTAMP';
    return textType;
  };
  return FILTER_COLUMN_NAMES.map(name => `${quote(name)} ${typeOf(name)}`).join(', ');
};

// ---------------------------------------------------------------------------
// BigQuery
// ---------------------------------------------------------------------------

let bqAdapter: BigQueryApiAdapter;
const bqFqn = (): string => `${BQ_PROJECT_ID}.${BQ_DATASET}.${TABLE_SUFFIX}`;
const bqOrdersFqn = (): string => `${BQ_PROJECT_ID}.${BQ_DATASET}.${ORDERS_TABLE_SUFFIX}`;
const bqAggFqn = (): string => `${BQ_PROJECT_ID}.${BQ_DATASET}.${AGG_TABLE_SUFFIX}`;
const bqBucketFqn = (): string => `${BQ_PROJECT_ID}.${BQ_DATASET}.${BUCKET_TABLE_SUFFIX}`;
const bqFilterFqn = (): string => `${BQ_PROJECT_ID}.${BQ_DATASET}.${FILTER_TABLE_SUFFIX}`;

const bigQueryCase: StorageCase = {
  label: 'BigQuery',
  storageType: DataStorageType.GOOGLE_BIGQUERY,
  available: BQ_AVAILABLE,
  storageApiType: 'GOOGLE_BIGQUERY',
  storageConfig: () => ({ projectId: BQ_PROJECT_ID! }),
  storageCredentials: () => JSON.parse(BQ_SERVICE_ACCOUNT_KEY!),
  fullyQualifiedName: bqFqn,
  ordersFullyQualifiedName: bqOrdersFqn,
  aggFullyQualifiedName: bqAggFqn,
  bucketFullyQualifiedName: bqBucketFqn,
  filterFullyQualifiedName: bqFilterFqn,
  rowLevelFormula: CONCAT_FORMULA,
  concat: concatOf,
  floatType: 'FLOAT',
  // BigQuery has no 32-bit float to declare: its `FLOAT` IS `FLOAT64`.
  narrowFloatType: 'FLOAT',
  // Both, because BigQuery is the dialect where a parameterized cast target is a hard query error
  // (`Parameterized types are not allowed in CAST expressions`) and both entries are therefore bare.
  exactTypes: ['NUMERIC', 'BIGNUMERIC'],
  integerType: 'INTEGER',
  integerOverTextSum: 'error',
  // `STRING >= DATE` has no signature here, and the DATE placeholder cast is what puts a DATE on
  // the right-hand side of a formula the analyst declared DATE (probe BQ-E4).
  misdeclaredIsoDateRange: 'error',
  functionDateHaving: 'error',
  unparseableComparison: 'error',
  relativeDateWrapsDate: true,
  seed: async () => {
    bqAdapter = new BigQueryApiAdapter(
      BigQueryServiceAccountCredentialsSchema.parse(JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)),
      { projectId: BQ_PROJECT_ID!, location: BIGQUERY_AUTODETECT_LOCATION }
    );
    for (const table of [bqFqn(), bqOrdersFqn(), bqAggFqn(), bqBucketFqn(), bqFilterFqn()]) {
      try {
        await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${table}\``);
      } catch {
        // ignore — a leftover table from a crashed run is the only thing this could hit
      }
    }
    await bqAdapter.executeQuery(
      `CREATE TABLE \`${bqFqn()}\` ` +
        `(channel STRING, customer_id STRING, part_a STRING, part_b STRING, ` +
        `amount FLOAT64, bonus FLOAT64)`
    );
    await bqAdapter.executeQuery(
      `INSERT INTO \`${bqFqn()}\` (channel, customer_id, part_a, part_b, amount, bonus) VALUES ` +
        SEED_ROWS.map(
          r =>
            `('${r.channel}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ` +
            `${r.amount}.0, ${r.bonus}.0)`
        ).join(', ')
    );
    await bqAdapter.executeQuery(
      `CREATE TABLE \`${bqOrdersFqn()}\` (customer_id STRING, revenue FLOAT64, ctr FLOAT64)`
    );
    await bqAdapter.executeQuery(
      `INSERT INTO \`${bqOrdersFqn()}\` (customer_id, revenue, ctr) VALUES ` +
        ORDER_ROWS.map(r => `('${r.customer_id}', ${r.revenue}.0, ${r.ctr})`).join(', ')
    );
    await bqAdapter.executeQuery(
      `CREATE TABLE \`${bqAggFqn()}\` ` +
        `(country STRING, customer_id STRING, part_a STRING, part_b STRING, amount FLOAT64)`
    );
    await bqAdapter.executeQuery(
      `INSERT INTO \`${bqAggFqn()}\` (country, customer_id, part_a, part_b, amount) VALUES ` +
        AGG_SEED_ROWS.map(
          r => `('${r.country}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ${r.amount}.0)`
        ).join(', ')
    );
    await bqAdapter.executeQuery(
      `CREATE TABLE \`${bqBucketFqn()}\` ` +
        `(customer_id STRING, event_date DATE, fallback_date DATE, num_prefix STRING, ` +
        `num_suffix STRING, amb_prefix STRING, amb_suffix STRING, big_prefix STRING, ` +
        `big_suffix STRING, amount FLOAT64)`
    );
    await bqAdapter.executeQuery(
      `INSERT INTO \`${bqBucketFqn()}\` (customer_id, event_date, fallback_date, num_prefix, ` +
        `num_suffix, amb_prefix, amb_suffix, big_prefix, big_suffix, amount) VALUES ` +
        BUCKET_SEED_ROWS.map(
          r =>
            `('${r.customer_id}', ${dateLiteral(r.event_date)}, ` +
            `${dateLiteral(r.fallback_date)}, '${r.num_prefix}', '${r.num_suffix}', ` +
            `'${AMBIGUOUS_PREFIX}', '${AMBIGUOUS_SUFFIX}', '${BIG_PREFIX}', '${BIG_SUFFIX}', ` +
            `${r.amount}.0)`
        ).join(', ')
    );
    await bqAdapter.executeQuery(
      `CREATE TABLE \`${bqFilterFqn()}\` (${filterTableColumns('STRING', 'FLOAT64')})`
    );
    await bqAdapter.executeQuery(
      `INSERT INTO \`${bqFilterFqn()}\` (${filterColumnList()}) VALUES ` +
        FILTER_SEED_ROWS.map(r => filterRowValues(r, 'STRING')).join(', ')
    );
  },
  teardown: async () => {
    await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqFqn()}\``);
    await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqOrdersFqn()}\``);
    await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqAggFqn()}\``);
    await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqBucketFqn()}\``);
    await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqFilterFqn()}\``);
  },
};

// ---------------------------------------------------------------------------
// Athena — DDL wants backticks, DML/CTAS wants double quotes (README).
// ---------------------------------------------------------------------------

let athenaAdapter: AthenaApiAdapter;
let athenaS3: S3ApiAdapter;
const ATHENA_S3_PREFIX = `integration-test/${TABLE_SUFFIX}/`;

const athenaCase: StorageCase = {
  label: 'Athena',
  storageType: DataStorageType.AWS_ATHENA,
  available: ATHENA_AVAILABLE,
  storageApiType: 'AWS_ATHENA',
  storageConfig: () => ({ region: ATHENA_REGION!, outputBucket: ATHENA_OUTPUT_BUCKET! }),
  storageCredentials: () => ({
    accessKeyId: AWS_ACCESS_KEY_ID!,
    secretAccessKey: AWS_SECRET_ACCESS_KEY!,
  }),
  fullyQualifiedName: () => `${ATHENA_DATABASE}.${TABLE_SUFFIX}`,
  ordersFullyQualifiedName: () => `${ATHENA_DATABASE}.${ORDERS_TABLE_SUFFIX}`,
  aggFullyQualifiedName: () => `${ATHENA_DATABASE}.${AGG_TABLE_SUFFIX}`,
  bucketFullyQualifiedName: () => `${ATHENA_DATABASE}.${BUCKET_TABLE_SUFFIX}`,
  filterFullyQualifiedName: () => `${ATHENA_DATABASE}.${FILTER_TABLE_SUFFIX}`,
  rowLevelFormula: CONCAT_FORMULA,
  concat: concatOf,
  // DOUBLE, not REAL: Trino's REAL is 32-bit, and the 32-bit rule keeps a declared float on the dialect's
  // 64-bit target so the cast cannot move a number that is already right.
  floatType: 'DOUBLE',
  narrowFloatType: 'REAL',
  exactTypes: ['DECIMAL'],
  integerType: 'INTEGER',
  integerOverTextSum: 'error',
  // `Cannot apply operator: varchar <= date` — the same refusal shape as BigQuery's (probe ATH-E4).
  misdeclaredIsoDateRange: 'error',
  functionDateHaving: 'error',
  unparseableComparison: 'error',
  relativeDateWrapsDate: false,
  seed: async () => {
    const config = { region: ATHENA_REGION!, outputBucket: ATHENA_OUTPUT_BUCKET! };
    const credentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };
    athenaAdapter = new AthenaApiAdapter(credentials, config);
    athenaS3 = new S3ApiAdapter(credentials, config);

    for (const table of [
      TABLE_SUFFIX,
      ORDERS_TABLE_SUFFIX,
      AGG_TABLE_SUFFIX,
      BUCKET_TABLE_SUFFIX,
      FILTER_TABLE_SUFFIX,
    ]) {
      try {
        const { queryExecutionId } = await athenaAdapter.executeQuery(
          `DROP TABLE IF EXISTS \`${ATHENA_DATABASE}\`.\`${table}\``,
          ATHENA_OUTPUT_BUCKET!,
          `${ATHENA_S3_PREFIX}cleanup/`
        );
        await athenaAdapter.waitForQueryToComplete(queryExecutionId);
      } catch {
        // ignore
      }
    }

    const values = SEED_ROWS.map(
      r =>
        `(CAST('${r.channel}' AS VARCHAR), CAST('${r.customer_id}' AS VARCHAR), ` +
        `CAST('${r.part_a}' AS VARCHAR), CAST('${r.part_b}' AS VARCHAR), ` +
        `CAST(${r.amount} AS DOUBLE), CAST(${r.bonus} AS DOUBLE))`
    ).join(',\n  ');
    const { queryExecutionId } = await athenaAdapter.executeQuery(
      `CREATE TABLE "${ATHENA_DATABASE}"."${TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${ATHENA_OUTPUT_BUCKET}/${ATHENA_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ${values}
) AS t (channel, customer_id, part_a, part_b, amount, bonus)`,
      ATHENA_OUTPUT_BUCKET!,
      `${ATHENA_S3_PREFIX}ctas/`
    );
    await athenaAdapter.waitForQueryToComplete(queryExecutionId);

    const orderValues = ORDER_ROWS.map(
      r =>
        `(CAST('${r.customer_id}' AS VARCHAR), CAST(${r.revenue} AS DOUBLE), ` +
        `CAST(${r.ctr} AS DOUBLE))`
    ).join(',\n  ');
    const orders = await athenaAdapter.executeQuery(
      `CREATE TABLE "${ATHENA_DATABASE}"."${ORDERS_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${ATHENA_OUTPUT_BUCKET}/${ATHENA_S3_PREFIX}orders_data/')
AS SELECT * FROM (VALUES
  ${orderValues}
) AS t (customer_id, revenue, ctr)`,
      ATHENA_OUTPUT_BUCKET!,
      `${ATHENA_S3_PREFIX}ctas/`
    );
    await athenaAdapter.waitForQueryToComplete(orders.queryExecutionId);

    const aggValues = AGG_SEED_ROWS.map(
      r =>
        `(CAST('${r.country}' AS VARCHAR), CAST('${r.customer_id}' AS VARCHAR), ` +
        `CAST('${r.part_a}' AS VARCHAR), CAST('${r.part_b}' AS VARCHAR), ` +
        `CAST(${r.amount} AS DOUBLE))`
    ).join(',\n  ');
    const agg = await athenaAdapter.executeQuery(
      `CREATE TABLE "${ATHENA_DATABASE}"."${AGG_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${ATHENA_OUTPUT_BUCKET}/${ATHENA_S3_PREFIX}agg_data/')
AS SELECT * FROM (VALUES
  ${aggValues}
) AS t (country, customer_id, part_a, part_b, amount)`,
      ATHENA_OUTPUT_BUCKET!,
      `${ATHENA_S3_PREFIX}ctas/`
    );
    await athenaAdapter.waitForQueryToComplete(agg.queryExecutionId);

    const bucketValues = BUCKET_SEED_ROWS.map(
      r =>
        `(CAST('${r.customer_id}' AS VARCHAR), ${dateLiteral(r.event_date)}, ` +
        `${dateLiteral(r.fallback_date)}, CAST('${r.num_prefix}' AS VARCHAR), ` +
        `CAST('${r.num_suffix}' AS VARCHAR), CAST('${AMBIGUOUS_PREFIX}' AS VARCHAR), ` +
        `CAST('${AMBIGUOUS_SUFFIX}' AS VARCHAR), CAST('${BIG_PREFIX}' AS VARCHAR), ` +
        `CAST('${BIG_SUFFIX}' AS VARCHAR), CAST(${r.amount} AS DOUBLE))`
    ).join(',\n  ');
    const bucket = await athenaAdapter.executeQuery(
      `CREATE TABLE "${ATHENA_DATABASE}"."${BUCKET_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${ATHENA_OUTPUT_BUCKET}/${ATHENA_S3_PREFIX}bucket_data/')
AS SELECT * FROM (VALUES
  ${bucketValues}
) AS t (customer_id, event_date, fallback_date, num_prefix, num_suffix, amb_prefix, amb_suffix, big_prefix, big_suffix, amount)`,
      ATHENA_OUTPUT_BUCKET!,
      `${ATHENA_S3_PREFIX}ctas/`
    );
    await athenaAdapter.waitForQueryToComplete(bucket.queryExecutionId);

    const filterValues = FILTER_SEED_ROWS.map(r => filterRowValues(r, 'VARCHAR')).join(',\n  ');
    const filter = await athenaAdapter.executeQuery(
      `CREATE TABLE "${ATHENA_DATABASE}"."${FILTER_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${ATHENA_OUTPUT_BUCKET}/${ATHENA_S3_PREFIX}filter_data/')
AS SELECT * FROM (VALUES
  ${filterValues}
) AS t (${filterColumnList()})`,
      ATHENA_OUTPUT_BUCKET!,
      `${ATHENA_S3_PREFIX}ctas/`
    );
    await athenaAdapter.waitForQueryToComplete(filter.queryExecutionId);
  },
  teardown: async () => {
    for (const table of [
      TABLE_SUFFIX,
      ORDERS_TABLE_SUFFIX,
      AGG_TABLE_SUFFIX,
      BUCKET_TABLE_SUFFIX,
      FILTER_TABLE_SUFFIX,
    ]) {
      const { queryExecutionId } = await athenaAdapter.executeQuery(
        `DROP TABLE IF EXISTS \`${ATHENA_DATABASE}\`.\`${table}\``,
        ATHENA_OUTPUT_BUCKET!,
        `${ATHENA_S3_PREFIX}drop/`
      );
      await athenaAdapter.waitForQueryToComplete(queryExecutionId);
    }
    // One scoped sweep of this run's unique root — data, orders_data, agg_data, ctas, cleanup,
    // drop and every query result all live under it.
    await athenaS3.cleanupOutputFiles(ATHENA_OUTPUT_BUCKET!, ATHENA_S3_PREFIX);
  },
};

// ---------------------------------------------------------------------------
// Redshift — the one dialect that gets `||` instead of CONCAT.
// ---------------------------------------------------------------------------

let redshiftAdapter: RedshiftApiAdapter;

async function redshiftExec(sql: string): Promise<void> {
  // The Redshift Data API needs executeQuery + waitForQueryToComplete for statements with no
  // result set; executeQueryAndGetRows would call GetStatementResult and throw on DDL/DML.
  const { statementId } = await redshiftAdapter.executeQuery(sql);
  await redshiftAdapter.waitForQueryToComplete(statementId);
}

const redshiftCase: StorageCase = {
  label: 'Redshift',
  storageType: DataStorageType.AWS_REDSHIFT,
  available: REDSHIFT_AVAILABLE,
  storageApiType: 'AWS_REDSHIFT',
  storageConfig: () => ({
    connectionType: 'SERVERLESS',
    region: REDSHIFT_REGION!,
    database: REDSHIFT_DATABASE!,
    workgroupName: REDSHIFT_WORKGROUP_NAME!,
  }),
  storageCredentials: () => ({
    accessKeyId: AWS_ACCESS_KEY_ID!,
    secretAccessKey: AWS_SECRET_ACCESS_KEY!,
  }),
  fullyQualifiedName: () => `${REDSHIFT_DATABASE}.public.${TABLE_SUFFIX}`,
  ordersFullyQualifiedName: () => `${REDSHIFT_DATABASE}.public.${ORDERS_TABLE_SUFFIX}`,
  aggFullyQualifiedName: () => `${REDSHIFT_DATABASE}.public.${AGG_TABLE_SUFFIX}`,
  bucketFullyQualifiedName: () => `${REDSHIFT_DATABASE}.public.${BUCKET_TABLE_SUFFIX}`,
  filterFullyQualifiedName: () => `${REDSHIFT_DATABASE}.public.${FILTER_TABLE_SUFFIX}`,
  // Redshift binds `=` TIGHTER than `||`, so this formula is also what proves the Totals
  // kept-groups join parenthesises the grouping expression it interpolates into `<left> = <right>`
  // — unparenthesised it parses as `"part_a" || ("part_b" = …)`. See the metric-filter test.
  rowLevelFormula: PIPES_FORMULA,
  concat: pipesOf,
  // Redshift is the dialect this half of the slice exists for: uncast, it coerced the varchar to
  // `Decimal` at scale 0 and published a truncated total. REAL would be float4 here, so the rule sends
  // a declared float to DOUBLE PRECISION; this fixture declares that directly.
  floatType: 'DOUBLE PRECISION',
  narrowFloatType: 'REAL',
  // Both spellings, because they resolve to DIFFERENT cast targets — DECIMAL(38,18) and
  // NUMERIC(38,18) — and only one of them was ever named in the probe.
  exactTypes: ['DECIMAL', 'NUMERIC'],
  integerType: 'INTEGER',
  integerOverTextSum: NUMERIC_STRING_TRUNCATED_SUM,
  // The one dialect that emits NO cast on either side of a date comparison — `_columnType` is
  // still unread here, deliberately (dates are left as measured). The comparison is therefore
  // text against text, and ISO strings sort chronologically, so the RIGHT rows come back for the
  // WRONG reason. A non-ISO date string would return an empty report instead, silently.
  misdeclaredIsoDateRange: 'rows',
  functionDateHaving: 'lexicographic',
  unparseableComparison: 'error',
  relativeDateWrapsDate: false,
  seed: async () => {
    redshiftAdapter = new RedshiftApiAdapter(
      { accessKeyId: AWS_ACCESS_KEY_ID!, secretAccessKey: AWS_SECRET_ACCESS_KEY! },
      {
        connectionType: RedshiftConnectionType.SERVERLESS,
        region: REDSHIFT_REGION!,
        database: REDSHIFT_DATABASE!,
        workgroupName: REDSHIFT_WORKGROUP_NAME!,
      }
    );
    for (const table of [
      TABLE_SUFFIX,
      ORDERS_TABLE_SUFFIX,
      AGG_TABLE_SUFFIX,
      BUCKET_TABLE_SUFFIX,
      FILTER_TABLE_SUFFIX,
    ]) {
      try {
        await redshiftExec(`DROP TABLE IF EXISTS public."${table}"`);
      } catch {
        // ignore
      }
    }
    await redshiftExec(
      `CREATE TABLE public."${TABLE_SUFFIX}" ` +
        `(channel VARCHAR(50), customer_id VARCHAR(50), part_a VARCHAR(50), part_b VARCHAR(50), ` +
        `amount DOUBLE PRECISION, bonus DOUBLE PRECISION)`
    );
    await redshiftExec(
      `INSERT INTO public."${TABLE_SUFFIX}" ` +
        `(channel, customer_id, part_a, part_b, amount, bonus) VALUES ` +
        SEED_ROWS.map(
          r =>
            `('${r.channel}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ` +
            `${r.amount}, ${r.bonus})`
        ).join(', ')
    );
    await redshiftExec(
      `CREATE TABLE public."${ORDERS_TABLE_SUFFIX}" ` +
        `(customer_id VARCHAR(50), revenue DOUBLE PRECISION, ctr DOUBLE PRECISION)`
    );
    await redshiftExec(
      `INSERT INTO public."${ORDERS_TABLE_SUFFIX}" (customer_id, revenue, ctr) VALUES ` +
        ORDER_ROWS.map(r => `('${r.customer_id}', ${r.revenue}, ${r.ctr})`).join(', ')
    );
    await redshiftExec(
      `CREATE TABLE public."${AGG_TABLE_SUFFIX}" ` +
        `(country VARCHAR(50), customer_id VARCHAR(50), part_a VARCHAR(50), ` +
        `part_b VARCHAR(50), amount DOUBLE PRECISION)`
    );
    await redshiftExec(
      `INSERT INTO public."${AGG_TABLE_SUFFIX}" ` +
        `(country, customer_id, part_a, part_b, amount) VALUES ` +
        AGG_SEED_ROWS.map(
          r => `('${r.country}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ${r.amount})`
        ).join(', ')
    );
    await redshiftExec(
      `CREATE TABLE public."${BUCKET_TABLE_SUFFIX}" ` +
        `(customer_id VARCHAR(50), event_date DATE, fallback_date DATE, ` +
        `num_prefix VARCHAR(50), num_suffix VARCHAR(50), amb_prefix VARCHAR(50), ` +
        `amb_suffix VARCHAR(50), big_prefix VARCHAR(50), big_suffix VARCHAR(50), ` +
        `amount DOUBLE PRECISION)`
    );
    await redshiftExec(
      `INSERT INTO public."${BUCKET_TABLE_SUFFIX}" (customer_id, event_date, fallback_date, ` +
        `num_prefix, num_suffix, amb_prefix, amb_suffix, big_prefix, big_suffix, amount) VALUES ` +
        BUCKET_SEED_ROWS.map(
          r =>
            `('${r.customer_id}', ${dateLiteral(r.event_date)}, ` +
            `${dateLiteral(r.fallback_date)}, '${r.num_prefix}', '${r.num_suffix}', ` +
            `'${AMBIGUOUS_PREFIX}', '${AMBIGUOUS_SUFFIX}', '${BIG_PREFIX}', '${BIG_SUFFIX}', ` +
            `${r.amount})`
        ).join(', ')
    );
    await redshiftExec(
      `CREATE TABLE public."${FILTER_TABLE_SUFFIX}" ` +
        `(${filterTableColumns('VARCHAR(50)', 'DOUBLE PRECISION')})`
    );
    await redshiftExec(
      `INSERT INTO public."${FILTER_TABLE_SUFFIX}" (${filterColumnList()}) VALUES ` +
        FILTER_SEED_ROWS.map(r => filterRowValues(r, 'VARCHAR')).join(', ')
    );
  },
  teardown: async () => {
    await redshiftExec(`DROP TABLE IF EXISTS public."${TABLE_SUFFIX}"`);
    await redshiftExec(`DROP TABLE IF EXISTS public."${ORDERS_TABLE_SUFFIX}"`);
    await redshiftExec(`DROP TABLE IF EXISTS public."${AGG_TABLE_SUFFIX}"`);
    await redshiftExec(`DROP TABLE IF EXISTS public."${BUCKET_TABLE_SUFFIX}"`);
    await redshiftExec(`DROP TABLE IF EXISTS public."${FILTER_TABLE_SUFFIX}"`);
  },
};

// ---------------------------------------------------------------------------
// Snowflake — quoted lowercase identifiers, or the renderer's `"part_a"` misses.
// ---------------------------------------------------------------------------

let snowflakeAdapter: SnowflakeApiAdapter;
const snowflakeFqn = (): string => `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."${TABLE_SUFFIX}"`;
const snowflakeOrdersFqn = (): string =>
  `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."${ORDERS_TABLE_SUFFIX}"`;
const snowflakeAggFqn = (): string =>
  `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."${AGG_TABLE_SUFFIX}"`;
const snowflakeBucketFqn = (): string =>
  `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."${BUCKET_TABLE_SUFFIX}"`;
const snowflakeFilterFqn = (): string =>
  `${SNOWFLAKE_DATABASE}.${SNOWFLAKE_SCHEMA}."${FILTER_TABLE_SUFFIX}"`;

const snowflakeCase: StorageCase = {
  label: 'Snowflake',
  storageType: DataStorageType.SNOWFLAKE,
  available: SNOWFLAKE_AVAILABLE,
  storageApiType: 'SNOWFLAKE',
  storageConfig: () => ({ account: SNOWFLAKE_ACCOUNT!, warehouse: SNOWFLAKE_WAREHOUSE! }),
  storageCredentials: () => ({
    authMethod: SnowflakeAuthMethod.PASSWORD,
    username: SNOWFLAKE_USERNAME!,
    password: SNOWFLAKE_PASSWORD!,
  }),
  fullyQualifiedName: snowflakeFqn,
  ordersFullyQualifiedName: snowflakeOrdersFqn,
  aggFullyQualifiedName: snowflakeAggFqn,
  bucketFullyQualifiedName: snowflakeBucketFqn,
  filterFullyQualifiedName: snowflakeFilterFqn,
  rowLevelFormula: CONCAT_FORMULA,
  concat: concatOf,
  floatType: 'FLOAT',
  // Snowflake has no 32-bit float either — every one of its float spellings is `FLOAT`.
  narrowFloatType: 'FLOAT',
  exactTypes: ['NUMERIC'],
  integerType: 'INTEGER',
  // Snowflake coerces a numeric varchar faithfully, so the integer declaration — which emits no
  // cast at all — already returns the true total here. The cast is invisible on this dialect.
  integerOverTextSum: NUMERIC_STRING_TRUE_SUM,
  // Snowflake's `litCast` DOES emit `CAST('…' AS DATE)`, and the cast is what makes the comparison
  // a real DATE one — right on an ISO string, and the MDY re-interpretation on anything else.
  misdeclaredIsoDateRange: 'rows',
  functionDateHaving: 'date-mdy',
  unparseableComparison: 'error',
  relativeDateWrapsDate: false,
  seed: async () => {
    snowflakeAdapter = new SnowflakeApiAdapter(
      {
        authMethod: SnowflakeAuthMethod.PASSWORD,
        username: SNOWFLAKE_USERNAME!,
        password: SNOWFLAKE_PASSWORD!,
      },
      { account: SNOWFLAKE_ACCOUNT!, warehouse: SNOWFLAKE_WAREHOUSE! }
    );
    // Connect BEFORE the pre-cleanup try/catch: the SDK moves a connection to the fatal
    // StateDisconnected when connect() fails, and swallowing that leaves the adapter unusable.
    await snowflakeAdapter.checkAccess();
    for (const table of [
      snowflakeFqn(),
      snowflakeOrdersFqn(),
      snowflakeAggFqn(),
      snowflakeBucketFqn(),
      snowflakeFilterFqn(),
    ]) {
      try {
        await snowflakeAdapter.executeQuery(`DROP TABLE IF EXISTS ${table}`);
      } catch {
        // ignore
      }
    }
    await snowflakeAdapter.executeQuery(
      `CREATE TABLE ${snowflakeFqn()} ` +
        `("channel" VARCHAR(50), "customer_id" VARCHAR(50), "part_a" VARCHAR(50), ` +
        `"part_b" VARCHAR(50), "amount" DOUBLE, "bonus" DOUBLE)`
    );
    await snowflakeAdapter.executeQuery(
      `INSERT INTO ${snowflakeFqn()} ` +
        `("channel", "customer_id", "part_a", "part_b", "amount", "bonus") VALUES ` +
        SEED_ROWS.map(
          r =>
            `('${r.channel}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ` +
            `${r.amount}, ${r.bonus})`
        ).join(', ')
    );
    await snowflakeAdapter.executeQuery(
      `CREATE TABLE ${snowflakeOrdersFqn()} ` +
        `("customer_id" VARCHAR(50), "revenue" DOUBLE, "ctr" DOUBLE)`
    );
    await snowflakeAdapter.executeQuery(
      `INSERT INTO ${snowflakeOrdersFqn()} ("customer_id", "revenue", "ctr") VALUES ` +
        ORDER_ROWS.map(r => `('${r.customer_id}', ${r.revenue}, ${r.ctr})`).join(', ')
    );
    await snowflakeAdapter.executeQuery(
      `CREATE TABLE ${snowflakeAggFqn()} ` +
        `("country" VARCHAR(50), "customer_id" VARCHAR(50), "part_a" VARCHAR(50), ` +
        `"part_b" VARCHAR(50), "amount" DOUBLE)`
    );
    await snowflakeAdapter.executeQuery(
      `INSERT INTO ${snowflakeAggFqn()} ` +
        `("country", "customer_id", "part_a", "part_b", "amount") VALUES ` +
        AGG_SEED_ROWS.map(
          r => `('${r.country}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ${r.amount})`
        ).join(', ')
    );
    await snowflakeAdapter.executeQuery(
      `CREATE TABLE ${snowflakeBucketFqn()} ` +
        `("customer_id" VARCHAR(50), "event_date" DATE, "fallback_date" DATE, ` +
        `"num_prefix" VARCHAR(50), "num_suffix" VARCHAR(50), "amb_prefix" VARCHAR(50), ` +
        `"amb_suffix" VARCHAR(50), "big_prefix" VARCHAR(50), "big_suffix" VARCHAR(50), ` +
        `"amount" DOUBLE)`
    );
    await snowflakeAdapter.executeQuery(
      `INSERT INTO ${snowflakeBucketFqn()} ("customer_id", "event_date", "fallback_date", ` +
        `"num_prefix", "num_suffix", "amb_prefix", "amb_suffix", "big_prefix", "big_suffix", ` +
        `"amount") VALUES ` +
        BUCKET_SEED_ROWS.map(
          r =>
            `('${r.customer_id}', ${dateLiteral(r.event_date)}, ` +
            `${dateLiteral(r.fallback_date)}, '${r.num_prefix}', '${r.num_suffix}', ` +
            `'${AMBIGUOUS_PREFIX}', '${AMBIGUOUS_SUFFIX}', '${BIG_PREFIX}', '${BIG_SUFFIX}', ` +
            `${r.amount})`
        ).join(', ')
    );
    await snowflakeAdapter.executeQuery(
      `CREATE TABLE ${snowflakeFilterFqn()} ` +
        `(${filterTableColumns('VARCHAR(50)', 'DOUBLE', name => `"${name}"`)})`
    );
    await snowflakeAdapter.executeQuery(
      `INSERT INTO ${snowflakeFilterFqn()} (${filterColumnList(name => `"${name}"`)}) VALUES ` +
        FILTER_SEED_ROWS.map(r => filterRowValues(r, 'VARCHAR')).join(', ')
    );
  },
  teardown: async () => {
    await snowflakeAdapter.executeQuery(`DROP TABLE IF EXISTS ${snowflakeFqn()}`);
    await snowflakeAdapter.executeQuery(`DROP TABLE IF EXISTS ${snowflakeOrdersFqn()}`);
    await snowflakeAdapter.executeQuery(`DROP TABLE IF EXISTS ${snowflakeAggFqn()}`);
    await snowflakeAdapter.executeQuery(`DROP TABLE IF EXISTS ${snowflakeBucketFqn()}`);
    await snowflakeAdapter.executeQuery(`DROP TABLE IF EXISTS ${snowflakeFilterFqn()}`);
  },
};

// ---------------------------------------------------------------------------
// Databricks
// ---------------------------------------------------------------------------

let databricksAdapter: DatabricksApiAdapter;
const databricksQualified = (): string =>
  `\`${DATABRICKS_CATALOG}\`.\`${DATABRICKS_SCHEMA}\`.\`${TABLE_SUFFIX}\``;
const databricksOrdersQualified = (): string =>
  `\`${DATABRICKS_CATALOG}\`.\`${DATABRICKS_SCHEMA}\`.\`${ORDERS_TABLE_SUFFIX}\``;
const databricksAggQualified = (): string =>
  `\`${DATABRICKS_CATALOG}\`.\`${DATABRICKS_SCHEMA}\`.\`${AGG_TABLE_SUFFIX}\``;
const databricksBucketQualified = (): string =>
  `\`${DATABRICKS_CATALOG}\`.\`${DATABRICKS_SCHEMA}\`.\`${BUCKET_TABLE_SUFFIX}\``;
const databricksFilterQualified = (): string =>
  `\`${DATABRICKS_CATALOG}\`.\`${DATABRICKS_SCHEMA}\`.\`${FILTER_TABLE_SUFFIX}\``;

const databricksCase: StorageCase = {
  label: 'Databricks',
  storageType: DataStorageType.DATABRICKS,
  available: DATABRICKS_AVAILABLE,
  storageApiType: 'DATABRICKS',
  storageConfig: () => ({ host: DATABRICKS_HOST!, httpPath: DATABRICKS_HTTP_PATH! }),
  storageCredentials: () => ({
    authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
    token: DATABRICKS_TOKEN!,
  }),
  fullyQualifiedName: () => `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.${TABLE_SUFFIX}`,
  ordersFullyQualifiedName: () =>
    `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.${ORDERS_TABLE_SUFFIX}`,
  aggFullyQualifiedName: () => `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.${AGG_TABLE_SUFFIX}`,
  bucketFullyQualifiedName: () =>
    `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.${BUCKET_TABLE_SUFFIX}`,
  filterFullyQualifiedName: () =>
    `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.${FILTER_TABLE_SUFFIX}`,
  rowLevelFormula: CONCAT_FORMULA,
  concat: concatOf,
  // Spark's FLOAT is 32-bit, so a declared float goes to DOUBLE; this fixture declares the
  // 64-bit type the analyst's column already has.
  floatType: 'DOUBLE',
  narrowFloatType: 'FLOAT',
  exactTypes: ['DECIMAL'],
  integerType: 'INT',
  integerOverTextSum: NUMERIC_STRING_TRUE_SUM,
  // Spark coerces the STRING side of `string >= date` to DATE, and an ISO value parses, so the
  // comparison is a real date one and answers correctly. `05/08/2026` is what it refuses (DBX-E1),
  // which is why `functionDateHaving` is the loud one on this dialect and the range is not.
  misdeclaredIsoDateRange: 'rows',
  functionDateHaving: 'error',
  unparseableComparison: 'error',
  relativeDateWrapsDate: false,
  seed: async () => {
    databricksAdapter = new DatabricksApiAdapter(
      { authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN, token: DATABRICKS_TOKEN! },
      { host: DATABRICKS_HOST!, httpPath: DATABRICKS_HTTP_PATH! }
    );
    for (const table of [
      databricksQualified(),
      databricksOrdersQualified(),
      databricksAggQualified(),
      databricksBucketQualified(),
      databricksFilterQualified(),
    ]) {
      try {
        await databricksAdapter.executeQuery(`DROP TABLE IF EXISTS ${table}`);
      } catch {
        // ignore
      }
    }
    await databricksAdapter.executeQuery(
      `CREATE TABLE ${databricksQualified()} ` +
        `(channel STRING, customer_id STRING, part_a STRING, part_b STRING, ` +
        `amount DOUBLE, bonus DOUBLE) USING DELTA`
    );
    await databricksAdapter.executeQuery(
      `INSERT INTO ${databricksQualified()} ` +
        `(channel, customer_id, part_a, part_b, amount, bonus) VALUES ` +
        SEED_ROWS.map(
          r =>
            `('${r.channel}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ` +
            `${r.amount}, ${r.bonus})`
        ).join(', ')
    );
    await databricksAdapter.executeQuery(
      `CREATE TABLE ${databricksOrdersQualified()} ` +
        `(customer_id STRING, revenue DOUBLE, ctr DOUBLE) USING DELTA`
    );
    await databricksAdapter.executeQuery(
      `INSERT INTO ${databricksOrdersQualified()} (customer_id, revenue, ctr) VALUES ` +
        ORDER_ROWS.map(r => `('${r.customer_id}', ${r.revenue}, ${r.ctr})`).join(', ')
    );
    await databricksAdapter.executeQuery(
      `CREATE TABLE ${databricksAggQualified()} ` +
        `(country STRING, customer_id STRING, part_a STRING, part_b STRING, amount DOUBLE) ` +
        `USING DELTA`
    );
    await databricksAdapter.executeQuery(
      `INSERT INTO ${databricksAggQualified()} ` +
        `(country, customer_id, part_a, part_b, amount) VALUES ` +
        AGG_SEED_ROWS.map(
          r => `('${r.country}', '${r.customer_id}', '${r.part_a}', '${r.part_b}', ${r.amount})`
        ).join(', ')
    );
    await databricksAdapter.executeQuery(
      `CREATE TABLE ${databricksBucketQualified()} ` +
        `(customer_id STRING, event_date DATE, fallback_date DATE, num_prefix STRING, ` +
        `num_suffix STRING, amb_prefix STRING, amb_suffix STRING, big_prefix STRING, ` +
        `big_suffix STRING, amount DOUBLE) USING DELTA`
    );
    await databricksAdapter.executeQuery(
      `INSERT INTO ${databricksBucketQualified()} (customer_id, event_date, fallback_date, ` +
        `num_prefix, num_suffix, amb_prefix, amb_suffix, big_prefix, big_suffix, amount) VALUES ` +
        BUCKET_SEED_ROWS.map(
          r =>
            `('${r.customer_id}', ${dateLiteral(r.event_date)}, ` +
            `${dateLiteral(r.fallback_date)}, '${r.num_prefix}', '${r.num_suffix}', ` +
            `'${AMBIGUOUS_PREFIX}', '${AMBIGUOUS_SUFFIX}', '${BIG_PREFIX}', '${BIG_SUFFIX}', ` +
            `${r.amount})`
        ).join(', ')
    );
    await databricksAdapter.executeQuery(
      `CREATE TABLE ${databricksFilterQualified()} ` +
        `(${filterTableColumns('STRING', 'DOUBLE')}) USING DELTA`
    );
    await databricksAdapter.executeQuery(
      `INSERT INTO ${databricksFilterQualified()} (${filterColumnList()}) VALUES ` +
        FILTER_SEED_ROWS.map(r => filterRowValues(r, 'STRING')).join(', ')
    );
  },
  teardown: async () => {
    try {
      await databricksAdapter.executeQuery(`DROP TABLE IF EXISTS ${databricksQualified()}`);
      await databricksAdapter.executeQuery(`DROP TABLE IF EXISTS ${databricksOrdersQualified()}`);
      await databricksAdapter.executeQuery(`DROP TABLE IF EXISTS ${databricksAggQualified()}`);
      await databricksAdapter.executeQuery(`DROP TABLE IF EXISTS ${databricksBucketQualified()}`);
      await databricksAdapter.executeQuery(`DROP TABLE IF EXISTS ${databricksFilterQualified()}`);
    } finally {
      await databricksAdapter.destroy();
    }
  },
};

// ---------------------------------------------------------------------------
// Shared read path — the same services and the same option pairing
// RunReportService.executeReport uses for a non-blended report.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

async function readReportRows(
  storageType: DataStorageType,
  report: ReportLikeReadPlan
): Promise<Row[]> {
  const decision = await blendedReportData.resolveBlendingDecision(report, ACCESSOR);
  const composed = await composer.compose(report, ACCESSOR, decision);

  const reader = await readerResolver.resolve(storageType);
  const rows: Row[] = [];
  try {
    const description = await reader.prepareReportData(report, {
      sqlOverride: composed.sql,
      sqlOverrideParams: composed.params,
      columnFilter: columnFilterWithoutCalculatedFields(
        decision.columnFilter,
        composed.calculatedFields
      ),
      blendedDataHeaders: decision.blendedDataHeaders,
      aggregationConfig: decision.aggregations ?? report.aggregationConfig ?? undefined,
      calculatedFields: composed.calculatedFields,
    });
    const headerNames = description.dataHeaders.map(h => h.name);

    let nextBatchId: string | undefined = undefined;
    do {
      const batch = await reader.readReportDataBatch(nextBatchId);
      for (const dataRow of batch.dataRows) {
        rows.push(Object.fromEntries(headerNames.map((name, i) => [name, dataRow[i]])));
      }
      nextBatchId = batch.nextDataBatchId ?? undefined;
    } while (nextBatchId);
  } finally {
    await reader.finalize();
  }
  return rows;
}

/**
 * The SQL the report composes, through the same two calls `readReportRows` makes. Used only where
 * a claim is about the query's SHAPE rather than its numbers — "this blended report carries no
 * metric sleeve", which no returned value can show.
 */
async function composeReportSql(report: ReportLikeReadPlan): Promise<string> {
  const decision = await blendedReportData.resolveBlendingDecision(report, ACCESSOR);
  const composed = await composer.compose(report, ACCESSOR, decision);
  return composed.sql;
}

/**
 * The report's Totals block, computed exactly as `ReportTotalsService.computeTotals` computes it —
 * same `composeTotals`, same reader, same option pairing, same `maxDataRows = 1` read, same
 * one-row zip.
 *
 * The batch size of 1 is load-bearing, not incidental: a reader must return ONE DATA ROW for it on
 * every storage. Athena's `MaxResults` counts the header row it returns on the first page, so its
 * reader has to ask the API for one more than the caller's data-row budget; when it did not, every
 * Athena report's Totals block was silently `null`. Reading at exactly 1 here keeps that guarantee
 * executed on all five storages, and the Totals test cross-checks the production service on top.
 */
async function readTotals(
  storageType: DataStorageType,
  report: ReportLikeReadPlan
): Promise<Row | null> {
  const totals = await composer.composeTotals(report, ACCESSOR);
  if (!totals) return null;

  const reader = await readerResolver.resolve(storageType);
  try {
    const description = await reader.prepareReportData(report, {
      sqlOverride: totals.sql,
      sqlOverrideParams: totals.params,
      columnFilter: columnFilterWithoutCalculatedFields(totals.columns, totals.calculatedFields),
      aggregationConfig: totals.aggregations,
      blendedDataHeaders: totals.blendedDataHeaders,
      rowCount: false,
      calculatedFields: totals.calculatedFields,
    });
    const batch = await reader.readReportDataBatch(undefined, 1);
    const row = batch.dataRows[0];
    if (!row) return null;
    return Object.fromEntries(description.dataHeaders.map((header, i) => [header.name, row[i]]));
  } finally {
    await reader.finalize();
  }
}

function byKey(rows: Row[], keyField: string): Map<string, Row> {
  return new Map(rows.map(row => [String(row[keyField]), row]));
}

/** `<channel>|<session_key>` — the joined report's grain, as one comparable string. */
function joinedGroupKey(row: Row): string {
  return `${String(row[CHANNEL])}|${String(row[SESSION_KEY])}`;
}

/**
 * The `YYYY-MM` a bucket value reads as — as a SET, because two of the five drivers hand a bare
 * `2026-08-01` back as a JS Date and nothing in the value says which zone its midnight was meant
 * in. Both readings of the same instant are accepted; they can only ever differ by one day, and
 * the wrong answer this fixture guards against is a different MONTH entirely.
 */
function monthKeysOf(value: unknown): Set<string> {
  const pad = (month: number): string => String(month).padStart(2, '0');
  if (value instanceof Date) {
    return new Set([
      `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}`,
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}`,
    ]);
  }
  const text = String(value);
  const match = /(\d{4})-(\d{2})/.exec(text);
  if (!match) {
    throw new Error(`bucket value '${text}' does not read as a date`);
  }
  return new Set([`${match[1]}-${match[2]}`]);
}

/** The one row whose bucket reads as `month`, asserted to be exactly one. */
function rowForMonth(rows: Row[], column: string, month: string): Row {
  const matching = rows.filter(row => monthKeysOf(row[column]).has(month));
  expect(matching.map(row => String(row[column]))).toHaveLength(1);
  return matching[0];
}

interface ActualizedSchema {
  type: string;
  fields: DataMartSchemaField[];
}

/**
 * One Data Mart, through the real HTTP API: create → TABLE definition → publish → schema
 * actualization. Publish validates the definition but does not populate the schema; actualize
 * reads the live table's field names and types and persists them.
 */
async function provisionMart(
  storageId: string,
  title: string,
  fullyQualifiedName: string
): Promise<{ id: string; schema: ActualizedSchema }> {
  const martCreateRes = await agent
    .post('/api/data-marts')
    .set(AUTH_HEADER)
    .send({ title, storageId });
  expect(martCreateRes.status).toBe(201);
  const id: string = martCreateRes.body.id;

  const defRes = await agent
    .put(`/api/data-marts/${id}/definition`)
    .set(AUTH_HEADER)
    .send({ definitionType: 'TABLE', definition: { fullyQualifiedName } });
  expect(defRes.status).toBe(200);

  const publishRes = await agent.put(`/api/data-marts/${id}/publish`).set(AUTH_HEADER);
  expect(publishRes.status).toBe(200);

  const entity = await dataMartService.getByIdAndProjectId(id, NULL_IDP_PROJECT_ID);
  await dataMartService.actualizeSchemaInEntity(entity);
  await dataMartService.save(entity);

  return { id, schema: JSON.parse(JSON.stringify(entity.schema)) as ActualizedSchema };
}

// ---------------------------------------------------------------------------
// The suite, registered once per storage.
// ---------------------------------------------------------------------------

function registerSuite(storage: StorageCase): void {
  const describeIfCredentials = storage.available ? describe : describe.skip;

  describeIfCredentials(`Row-level Calculated Field on real ${storage.label}`, () => {
    let dataMartId: string;
    let aggDataMartId: string;
    let referenceDataMartId: string;
    let bucketDataMartId: string;
    let filterDataMartId: string;
    let refusalDataMartId: string;

    beforeAll(async () => {
      await storage.seed();

      const storageCreateRes = await agent
        .post('/api/data-storages')
        .set(AUTH_HEADER)
        .send({ type: storage.storageApiType });
      expect(storageCreateRes.status).toBe(201);
      const storageId: string = storageCreateRes.body.id;

      const storageUpdateRes = await agent
        .put(`/api/data-storages/${storageId}`)
        .set(AUTH_HEADER)
        .send({
          title: `${storage.label.toLowerCase()}-row-level-calculated-field`,
          config: storage.storageConfig(),
          credentials: storage.storageCredentials(),
        });
      expect(storageUpdateRes.status).toBe(200);

      const main = await provisionMart(
        storageId,
        'row-level-calculated-field-mart',
        storage.fullyQualifiedName()
      );
      dataMartId = main.id;
      const actualized = main.schema;

      // The joined mart and the relationship are provisioned BEFORE the calculated fields are
      // saved, so the formula below is saved on a Data Mart that already joins another — the
      // configuration the flat path refused outright.
      const orders = await provisionMart(
        storageId,
        'row-level-calculated-field-orders-mart',
        storage.ordersFullyQualifiedName()
      );
      // `ctr` is the quiet-shape payload and nothing else reads it: a real column of this
      // TABLE whose name a SECOND Data Mart over the same table gives to a formula.
      expect(orders.schema.fields.map(f => f.name).sort()).toEqual([
        'ctr',
        'customer_id',
        'revenue',
      ]);

      const relationshipRes = await agent
        .post(`/api/data-marts/${dataMartId}/relationships`)
        .set(AUTH_HEADER)
        .send({
          targetDataMartId: orders.id,
          targetAlias: ORDERS_ALIAS,
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        });
      expect(relationshipRes.status).toBe(201);

      // Both calculated fields declare the type of an EXISTING actualized field rather than a
      // hard-coded literal — the per-storage field-type vocabularies differ, and the declared type
      // is the analyst's free choice anyway.
      const partA = actualized.fields.find(f => f.name === 'part_a')!;
      const amount = actualized.fields.find(f => f.name === 'amount')!;
      expect(partA).toBeDefined();
      expect(amount).toBeDefined();

      const schemaRes = await agent
        .put(`/api/data-marts/${dataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            ...actualized,
            fields: [
              ...actualized.fields,
              // No `level` on the wire: the backend DERIVES it from the formula, and the
              // assertion below is what proves it did rather than echoing a client's claim.
              { ...partA, name: SESSION_KEY, calculated: { formula: storage.rowLevelFormula } },
              { ...amount, name: BONUS_RATE, calculated: { formula: BONUS_RATE_FORMULA } },
            ],
          },
        });
      if (schemaRes.status !== 200) {
        console.error(
          `${storage.label} schema save failed:`,
          JSON.stringify(schemaRes.body, null, 2)
        );
      }
      expect(schemaRes.status).toBe(200);

      const saved = schemaRes.body.schema.fields as DataMartSchemaField[];
      expect(saved.find(f => f.name === SESSION_KEY)!.calculated!.level).toBe('column');
      expect(saved.find(f => f.name === BONUS_RATE)!.calculated!.level).toBe('metric');
      // A skipped stamp would mean the formula never reached this warehouse — the whole point of
      // running here rather than in a unit test.
      expect(saved.find(f => f.name === SESSION_KEY)!.calculated!.warehouseValidation).toBe(
        'passed'
      );

      // ── The aggregated mart: the eight-row table, joined to the SAME `orders` mart ──────────
      const agg = await provisionMart(
        storageId,
        'aggregated-calculated-field-mart',
        storage.aggFullyQualifiedName()
      );
      aggDataMartId = agg.id;

      const aggRelationshipRes = await agent
        .post(`/api/data-marts/${aggDataMartId}/relationships`)
        .set(AUTH_HEADER)
        .send({
          targetDataMartId: orders.id,
          targetAlias: ORDERS_ALIAS,
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        });
      expect(aggRelationshipRes.status).toBe(201);

      const aggPartA = agg.schema.fields.find(f => f.name === 'part_a')!;
      expect(aggPartA).toBeDefined();

      const aggSchemaRes = await agent
        .put(`/api/data-marts/${aggDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            ...agg.schema,
            fields: [
              ...agg.schema.fields,
              { ...aggPartA, name: SESSION_KEY, calculated: { formula: storage.rowLevelFormula } },
            ],
          },
        });
      if (aggSchemaRes.status !== 200) {
        console.error(
          `${storage.label} aggregated-mart schema save failed:`,
          JSON.stringify(aggSchemaRes.body, null, 2)
        );
      }
      expect(aggSchemaRes.status).toBe(200);

      const aggSaved = aggSchemaRes.body.schema.fields as DataMartSchemaField[];
      const aggSessionKey = aggSaved.find(f => f.name === SESSION_KEY)!;
      // Still DERIVED as row-level: the aggregation the tests below apply is the REPORT's, and it
      // must not change what the field is — only what a query does with it.
      expect(aggSessionKey.calculated!.level).toBe('column');
      expect(aggSessionKey.calculated!.warehouseValidation).toBe('passed');

      // ── A formula referencing another formula: a THIRD mart over the SAME five-row table ────
      // Its own Data Mart rather than more fields on the first one, so that nothing here can move
      // a number the thirteen tests above assert. No extra warehouse table: the five rows already
      // carry two numeric columns and a coarse dimension, which is all `roas` needs.
      const reference = await provisionMart(
        storageId,
        'formula-referencing-formula-mart',
        storage.fullyQualifiedName()
      );
      referenceDataMartId = reference.id;

      const referenceRelationshipRes = await agent
        .post(`/api/data-marts/${referenceDataMartId}/relationships`)
        .set(AUTH_HEADER)
        .send({
          targetDataMartId: orders.id,
          targetAlias: ORDERS_ALIAS,
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        });
      expect(referenceRelationshipRes.status).toBe(201);

      const referencePartA = reference.schema.fields.find(f => f.name === 'part_a')!;
      const referenceAmount = reference.schema.fields.find(f => f.name === 'amount')!;
      expect(referencePartA).toBeDefined();
      expect(referenceAmount).toBeDefined();

      const referenceSchemaRes = await agent
        .put(`/api/data-marts/${referenceDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            ...reference.schema,
            fields: [
              ...reference.schema.fields,
              { ...referenceAmount, name: REVENUE, calculated: { formula: REVENUE_FORMULA } },
              { ...referenceAmount, name: COST, calculated: { formula: COST_FORMULA } },
              { ...referenceAmount, name: ROAS, calculated: { formula: ROAS_FORMULA } },
              {
                ...referencePartA,
                name: SESSION_KEY,
                calculated: { formula: storage.rowLevelFormula },
              },
              {
                ...referencePartA,
                name: SESSION_UPPER,
                calculated: { formula: SESSION_UPPER_FORMULA },
              },
            ],
          },
        });
      if (referenceSchemaRes.status !== 200) {
        console.error(
          `${storage.label} formula-reference schema save failed:`,
          JSON.stringify(referenceSchemaRes.body, null, 2)
        );
      }
      expect(referenceSchemaRes.status).toBe(200);

      const referenceSaved = referenceSchemaRes.body.schema.fields as DataMartSchemaField[];
      const levelOf = (name: string) =>
        referenceSaved.find(f => f.name === name)!.calculated!.level;
      expect(levelOf(REVENUE)).toBe('metric');
      expect(levelOf(COST)).toBe('metric');
      // TRANSITIVE, both ways, and derived on the wire rather than claimed by the client: `roas`
      // holds no aggregate call of its own and `session_upper` holds no column of
      // its own. Each is what its chain says it is.
      expect(levelOf(ROAS)).toBe('metric');
      expect(levelOf(SESSION_UPPER)).toBe('column');
      // And the SUBSTITUTED formula is what the warehouse accepted: a dry run that had spliced the
      // reference in raw would have been rejected by the storage, not stamped.
      expect(referenceSaved.find(f => f.name === ROAS)!.calculated!.warehouseValidation).toBe(
        'passed'
      );
      expect(
        referenceSaved.find(f => f.name === SESSION_UPPER)!.calculated!.warehouseValidation
      ).toBe('passed');

      // ── The dates and the declared types, on a nine-row table of its own ──────────
      const bucketMart = await provisionMart(
        storageId,
        'date-bucket-and-declared-type-mart',
        storage.bucketFullyQualifiedName()
      );
      bucketDataMartId = bucketMart.id;

      const bucketRelationshipRes = await agent
        .post(`/api/data-marts/${bucketDataMartId}/relationships`)
        .set(AUTH_HEADER)
        .send({
          targetDataMartId: orders.id,
          targetAlias: ORDERS_ALIAS,
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        });
      expect(bucketRelationshipRes.status).toBe(201);

      const eventDateField = bucketMart.schema.fields.find(f => f.name === 'event_date')!;
      const bucketAmountField = bucketMart.schema.fields.find(f => f.name === 'amount')!;
      expect(eventDateField).toBeDefined();
      expect(bucketAmountField).toBeDefined();

      const numericStringFormula = storage.concat(REF('num_prefix'), REF('num_suffix'));
      const bigStringFormula = storage.concat(REF('big_prefix'), REF('big_suffix'));
      const ambiguousFormula = storage.concat(REF('amb_prefix'), REF('amb_suffix'));
      // The declared type is the analyst's free choice and never checked against the formula,
      // so these are stated outright rather than copied off an actualized field: what the four
      // arithmetic tests measure is exactly what each declaration makes the warehouse do.
      const declaring = (name: string, type: string, formula: string) => ({
        ...bucketAmountField,
        name,
        type,
        calculated: { formula },
      });

      const bucketSchemaRes = await agent
        .put(`/api/data-marts/${bucketDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            ...bucketMart.schema,
            fields: [
              ...bucketMart.schema.fields,
              {
                ...eventDateField,
                name: EVENT_MONTH,
                calculated: { formula: EVENT_MONTH_FORMULA },
              },
              {
                ...eventDateField,
                name: AMBIGUOUS_TS,
                type: 'TIMESTAMP',
                calculated: { formula: ambiguousFormula },
              },
              declaring(NUM_FLOAT, storage.floatType, numericStringFormula),
              ...storage.exactTypes.map((type, index) =>
                declaring(exactFieldName(index), type, numericStringFormula)
              ),
              declaring(NUM_INT, storage.integerType, numericStringFormula),
              declaring(WIDE_FLOAT, storage.narrowFloatType, WIDE_FLOAT_FORMULA),
              declaring(HALF_FLOAT, storage.floatType, HALF_FORMULA),
              declaring(HALF_INT, storage.integerType, HALF_FORMULA),
              declaring(BIG_FLOAT, storage.floatType, bigStringFormula),
              declaring(BIG_EXACT, storage.exactTypes[0], bigStringFormula),
            ],
          },
        });
      if (bucketSchemaRes.status !== 200) {
        console.error(
          `${storage.label} date-bucket schema save failed:`,
          JSON.stringify(bucketSchemaRes.body, null, 2)
        );
      }
      expect(bucketSchemaRes.status).toBe(200);

      const bucketSaved = bucketSchemaRes.body.schema.fields as DataMartSchemaField[];
      const bucketField = (name: string) => bucketSaved.find(f => f.name === name)!;
      // Every one of them is row-level: none holds an aggregate call, and a bucket is only ever
      // offered to a dimension. A declared type does not make a field a metric.
      for (const name of [EVENT_MONTH, AMBIGUOUS_TS, NUM_FLOAT, NUM_INT, HALF_FLOAT, HALF_INT]) {
        expect(`${name}: ${bucketField(name).calculated!.level}`).toBe(`${name}: column`);
      }
      // And the declaration really is what the analyst asked for, read back off the save.
      expect(bucketField(NUM_FLOAT).type).toBe(storage.floatType);
      expect(bucketField(NUM_INT).type).toBe(storage.integerType);
      expect(bucketField(EVENT_MONTH).calculated!.warehouseValidation).toBe('passed');
      expect(bucketField(NUM_FLOAT).calculated!.warehouseValidation).toBe('passed');

      // ── Item 15: FILTERS on a calculated field, on an eight-row table of its own ────────────
      const filterMart = await provisionMart(
        storageId,
        'filters-on-calculated-fields-mart',
        storage.filterFullyQualifiedName()
      );
      filterDataMartId = filterMart.id;

      const filterRelationshipRes = await agent
        .post(`/api/data-marts/${filterDataMartId}/relationships`)
        .set(AUTH_HEADER)
        .send({
          targetDataMartId: orders.id,
          targetAlias: ORDERS_ALIAS,
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        });
      expect(filterRelationshipRes.status).toBe(201);

      const kaField = filterMart.schema.fields.find(f => f.name === 'ka')!;
      const filterAmountField = filterMart.schema.fields.find(f => f.name === 'amount')!;
      expect(kaField).toBeDefined();
      expect(filterAmountField).toBeDefined();
      const filterDeclaring = (name: string, type: string, formula: string) => ({
        ...filterAmountField,
        name,
        type,
        calculated: { formula },
      });

      const filterSchemaRes = await agent
        .put(`/api/data-marts/${filterDataMartId}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            ...filterMart.schema,
            fields: [
              ...filterMart.schema.fields,
              {
                ...kaField,
                name: FILTER_KEY,
                calculated: { formula: storage.concat(REF('ka'), REF('kb')) },
              },
              filterDeclaring(FILTER_BONUS_TOTAL, storage.floatType, 'SUM({{ref field="bonus"}})'),
              filterDeclaring(
                FILTER_NUM,
                storage.floatType,
                storage.concat(REF('n_prefix'), REF('n_suffix'))
              ),
              filterDeclaring(
                FILTER_SPELLED,
                storage.floatType,
                storage.concat(REF('sp_prefix'), REF('sp_suffix'))
              ),
              filterDeclaring(
                FILTER_BAD,
                storage.floatType,
                storage.concat(REF('bad_prefix'), REF('bad_suffix'))
              ),
              filterDeclaring(
                FILTER_HONEST_DATE,
                'DATE',
                `COALESCE(${REF('date_a')}, ${REF('date_b')})`
              ),
              filterDeclaring(
                FILTER_ISO_DATE,
                'DATE',
                storage.concat(REF('iso_prefix'), REF('iso_suffix'))
              ),
              filterDeclaring(
                FILTER_AMB_DATE,
                'DATE',
                storage.concat(REF('amb_prefix'), REF('amb_suffix'))
              ),
              filterDeclaring(
                FILTER_RECENT_TS,
                'TIMESTAMP',
                `COALESCE(${REF('ts_a')}, ${REF('ts_b')})`
              ),
            ],
          },
        });
      if (filterSchemaRes.status !== 200) {
        console.error(
          `${storage.label} filter-mart schema save failed:`,
          JSON.stringify(filterSchemaRes.body, null, 2)
        );
      }
      expect(filterSchemaRes.status).toBe(200);

      const filterSaved = filterSchemaRes.body.schema.fields as DataMartSchemaField[];
      const filterField = (name: string) => filterSaved.find(f => f.name === name)!;
      // The LEVEL is what decides WHERE against HAVING, and it is derived from the formula
      // rather than claimed on the wire — so this is the assertion the whole clause split rests on.
      for (const name of [
        FILTER_KEY,
        FILTER_NUM,
        FILTER_SPELLED,
        FILTER_BAD,
        FILTER_HONEST_DATE,
        FILTER_ISO_DATE,
        FILTER_AMB_DATE,
        FILTER_RECENT_TS,
      ]) {
        expect(`${name}: ${filterField(name).calculated!.level}`).toBe(`${name}: column`);
      }
      expect(`${FILTER_BONUS_TOTAL}: ${filterField(FILTER_BONUS_TOTAL).calculated!.level}`).toBe(
        `${FILTER_BONUS_TOTAL}: metric`
      );
      // The declaration really is the analyst's free choice, read back off the save: nothing
      // checked `iso_date`'s DATE against a formula that concatenates two strings, and nothing
      // checked `num_text`'s float either. That is the premise every cell below measures.
      expect(filterField(FILTER_NUM).type).toBe(storage.floatType);
      expect(filterField(FILTER_ISO_DATE).type).toBe('DATE');
      expect(filterField(FILTER_RECENT_TS).type).toBe('TIMESTAMP');
      expect(filterField(FILTER_KEY).calculated!.warehouseValidation).toBe('passed');
      expect(filterField(FILTER_BONUS_TOTAL).calculated!.warehouseValidation).toBe('passed');

      // ── The quiet shape of the refusal: a joined mart whose FORMULA is named after a real column ────
      // A second Data Mart over the `orders` TABLE, so the mart the seventeen tests above join is
      // left exactly as it was.
      const ordersWithFormula = await provisionMart(
        storageId,
        'orders-with-calculated-field-mart',
        storage.ordersFullyQualifiedName()
      );
      const ordersFormulaRes = await agent
        .put(`/api/data-marts/${ordersWithFormula.id}/schema`)
        .set(AUTH_HEADER)
        .send({
          schema: {
            ...ordersWithFormula.schema,
            fields: ordersWithFormula.schema.fields.map(field =>
              field.name === 'ctr'
                ? { ...field, calculated: { formula: ORDERS_CTR_FORMULA } }
                : field
            ),
          },
        });
      if (ordersFormulaRes.status !== 200) {
        console.error(
          `${storage.label} joined-formula schema save failed:`,
          JSON.stringify(ordersFormulaRes.body, null, 2)
        );
      }
      expect(ordersFormulaRes.status).toBe(200);
      const savedCtr = (ordersFormulaRes.body.schema.fields as DataMartSchemaField[]).find(
        f => f.name === 'ctr'
      )!;
      expect(savedCtr.calculated!.level).toBe('column');
      expect(savedCtr.calculated!.warehouseValidation).toBe('passed');

      const refusalMart = await provisionMart(
        storageId,
        'joined-calculated-field-refusal-mart',
        storage.bucketFullyQualifiedName()
      );
      refusalDataMartId = refusalMart.id;
      const refusalRelationshipRes = await agent
        .post(`/api/data-marts/${refusalDataMartId}/relationships`)
        .set(AUTH_HEADER)
        .send({
          targetDataMartId: ordersWithFormula.id,
          targetAlias: ORDERS_ALIAS,
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        });
      expect(refusalRelationshipRes.status).toBe(201);
    }, 600000);

    afterAll(async () => {
      try {
        await storage.teardown();
      } catch (error) {
        console.warn(`Failed to drop ${storage.label} test table during teardown:`, error);
      }
    }, 90000);

    async function buildReport(
      overrides: Partial<Omit<ReportLikeReadPlan, 'dataMart'>>
    ): Promise<ReportLikeReadPlan> {
      const dataMart = await dataMartService.getByIdAndProjectId(dataMartId, NULL_IDP_PROJECT_ID);
      return { dataMart, ...overrides };
    }

    /** The same, on the eight-row aggregated mart. */
    async function buildAggReport(
      overrides: Partial<Omit<ReportLikeReadPlan, 'dataMart'>>
    ): Promise<ReportLikeReadPlan> {
      const dataMart = await dataMartService.getByIdAndProjectId(
        aggDataMartId,
        NULL_IDP_PROJECT_ID
      );
      return { dataMart, ...overrides };
    }

    /** The same, on the mart whose formulas reference other formulas. */
    async function buildReferenceReport(
      overrides: Partial<Omit<ReportLikeReadPlan, 'dataMart'>>
    ): Promise<ReportLikeReadPlan> {
      const dataMart = await dataMartService.getByIdAndProjectId(
        referenceDataMartId,
        NULL_IDP_PROJECT_ID
      );
      return { dataMart, ...overrides };
    }

    /** The same, on the nine-row mart of dates and declared types. */
    async function buildBucketReport(
      overrides: Partial<Omit<ReportLikeReadPlan, 'dataMart'>>
    ): Promise<ReportLikeReadPlan> {
      const dataMart = await dataMartService.getByIdAndProjectId(
        bucketDataMartId,
        NULL_IDP_PROJECT_ID
      );
      return { dataMart, ...overrides };
    }

    /** The same, on the eight-row mart of filters. */
    async function buildFilterReport(
      overrides: Partial<Omit<ReportLikeReadPlan, 'dataMart'>>
    ): Promise<ReportLikeReadPlan> {
      const dataMart = await dataMartService.getByIdAndProjectId(
        filterDataMartId,
        NULL_IDP_PROJECT_ID
      );
      return { dataMart, ...overrides };
    }

    /** The same table, joined instead to the mart whose `ctr` is a FORMULA (the quiet shape). */
    async function buildRefusalReport(
      overrides: Partial<Omit<ReportLikeReadPlan, 'dataMart'>>
    ): Promise<ReportLikeReadPlan> {
      const dataMart = await dataMartService.getByIdAndProjectId(
        refusalDataMartId,
        NULL_IDP_PROJECT_ID
      );
      return { dataMart, ...overrides };
    }

    /**
     * `SUM` over ONE calculated field and nothing else — a metrics-only report, so the single
     * returned row carries the whole dataset's total and nothing can be read off a grouping key.
     */
    async function sumOfCalculatedField(field: string): Promise<number> {
      const rows = await readReportRows(
        storage.storageType,
        await buildBucketReport({
          columnConfig: [field],
          aggregationConfig: [{ column: field, function: 'SUM' }],
        })
      );
      expect(rows).toHaveLength(1);
      return Number(rows[0][`${field} | SUM`]);
    }

    it('projects the formula per row and keeps every source row', async () => {
      const report = await buildReport({ columnConfig: [SESSION_KEY] });

      const rows = await readReportRows(storage.storageType, report);

      // The falsification: a row-level field that still forced the AGGREGATED shape would have
      // grouped by its own expression and returned DISTINCT_SESSION_KEYS rows. The fixture makes
      // those two numbers differ — without the duplicate keys, 5 and 3 would coincide and this
      // assertion could not fail.
      expect(SOURCE_ROW_COUNT).not.toBe(DISTINCT_SESSION_KEYS);
      expect(rows).toHaveLength(SOURCE_ROW_COUNT);

      const values = rows.map(row => String(row[SESSION_KEY]));
      expect([...values].sort()).toEqual([...SESSION_KEYS_OF_EVERY_ROW].sort());
      expect(new Set(values).size).toBe(DISTINCT_SESSION_KEYS);

      // The projection is exactly the calculated field — no wildcard widening it back out.
      for (const row of rows) {
        expect(Object.keys(row)).toEqual([SESSION_KEY]);
      }
    }, 180000);

    it('groups by the whole expression, not by the columns it mentions', async () => {
      const report = await buildReport({
        columnConfig: [SESSION_KEY, 'amount'],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
      });

      const rows = await readReportRows(storage.storageType, report);

      // GROUP BY part_a, part_b would return DISTINCT_INPUT_COMBINATIONS rows instead — the
      // fixture's whole purpose is that these two counts differ.
      expect(DISTINCT_SESSION_KEYS).not.toBe(DISTINCT_INPUT_COMBINATIONS);
      expect(rows).toHaveLength(DISTINCT_SESSION_KEYS);

      const grouped = byKey(rows, SESSION_KEY);
      expect([...grouped.keys()].sort()).toEqual(Object.keys(SUM_BY_SESSION_KEY).sort());
      for (const [key, expectedSum] of Object.entries(SUM_BY_SESSION_KEY)) {
        expect(Number(grouped.get(key)![AMOUNT_SUM])).toBeCloseTo(expectedSum, 6);
        expect(Number(grouped.get(key)![ROW_COUNT])).toBe(ROW_COUNT_BY_SESSION_KEY[key]);
      }

      // 10 and 20 are the two sums ONLY the rejected grouping produces — the 'xyz' rows split back
      // apart. Their absence is what makes "grouped by the expression" a measurement, not a claim.
      const sums = rows.map(row => Number(row[AMOUNT_SUM]));
      for (const wrongSum of SUM_BY_INPUT_COMBINATION_ONLY) {
        expect(sums).not.toContain(wrongSum);
      }
    }, 180000);

    it('totals the whole dataset and carries no entry for the row-level field', async () => {
      const report = await buildReport({
        columnConfig: [SESSION_KEY, 'amount'],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
      });

      const totals = await readTotals(storage.storageType, report);

      expect(totals).not.toBeNull();
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(GRAND_TOTAL_SUM, 6);
      expect(Number(totals![`amount | AVG`])).toBeCloseTo(GRAND_TOTAL_AVG, 6);
      expect(Number(totals![`amount | MIN`])).toBeCloseTo(GRAND_TOTAL_MIN, 6);
      expect(Number(totals![`amount | MAX`])).toBeCloseTo(GRAND_TOTAL_MAX, 6);

      // Before the level gate, Totals admitted the row-level field, the aggregated renderer GROUPED
      // BY its expression, and computeTotals published dataRows[0] — i.e. ONE of these per-group
      // sums — as the grand total. Asserting the number rather than the missing key is what catches
      // that: the grand total must differ from every single group's value.
      for (const groupSum of Object.values(SUM_BY_SESSION_KEY)) {
        expect(GRAND_TOTAL_SUM).not.toBe(groupSum);
        expect(Number(totals![AMOUNT_SUM])).not.toBeCloseTo(groupSum, 6);
      }
      expect(Object.keys(totals!)).not.toContain(SESSION_KEY);

      // The production surface itself: every storage must hand back a block, and it must be the
      // one asserted above. Totals are best-effort, so a storage that silently returns `null` —
      // as Athena did while its reader spent the one-row budget on Athena's header row — loses
      // the block with no message, and the consumer re-aggregates the number itself.
      const serviceTotals = await totalsService.computeTotals(
        report,
        ACCESSOR,
        storage.storageType
      );
      expect(serviceTotals).not.toBeNull();
      expect(serviceTotals).toEqual(totals);
    }, 180000);

    async function metricFilteredReport(): Promise<ReportLikeReadPlan> {
      return buildReport({
        columnConfig: [SESSION_KEY, 'amount'],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
        filterConfig: [
          { column: 'amount', operator: 'gt', value: HAVING_THRESHOLD, function: 'SUM' },
        ],
      });
    }

    // The visible row set the report shows under the metric filter.
    async function assertKeptRows(): Promise<void> {
      const rows = await readReportRows(storage.storageType, await metricFilteredReport());
      const grouped = byKey(rows, SESSION_KEY);
      expect([...grouped.keys()].sort()).toEqual(KEPT_SESSION_KEYS);
      for (const key of KEPT_SESSION_KEYS) {
        expect(Number(grouped.get(key)![AMOUNT_SUM])).toBeCloseTo(SUM_BY_SESSION_KEY[key], 6);
      }
    }

    async function assertKeptGroupsTotals(): Promise<void> {
      const totals = await readTotals(storage.storageType, await metricFilteredReport());

      expect(totals).not.toBeNull();
      // Totals restricted to the ROWS of the kept groups: the four rows behind 'xyz' and 'pq'.
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(KEPT_ROWS_SUM, 6);
      // The falsification: a kept-groups restriction that dropped the row-level grouping key would
      // have no dimensions at all, so `SUM(amount) > 25` would be evaluated once over the whole
      // dataset (105 > 25), keep every row, and return the UNRESTRICTED grand total instead.
      expect(KEPT_ROWS_SUM).not.toBe(GRAND_TOTAL_SUM);
      expect(Number(totals![AMOUNT_SUM])).not.toBeCloseTo(GRAND_TOTAL_SUM, 6);
      // And it must equal what the visible rows add up to — same row set, same number.
      const visibleSum = KEPT_SESSION_KEYS.reduce((acc, key) => acc + SUM_BY_SESSION_KEY[key], 0);
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(visibleSum, 6);
    }

    it('keeps the same groups for the report and for Totals under a metric filter', async () => {
      await assertKeptRows();
      // Redshift runs this over `part_a || part_b`, so the Totals half also measures that the join
      // predicate parenthesises the grouping expression it interpolates: an operator binding looser
      // than `=` is mis-parsed without it, and Totals being best-effort the analyst would just lose
      // the block with no message.
      await assertKeptGroupsTotals();
    }, 300000);

    it('composes a row-level and an aggregate-level formula together', async () => {
      const report = await buildReport({
        columnConfig: [SESSION_KEY, 'amount', BONUS_RATE],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
      });

      const rows = await readReportRows(storage.storageType, report);

      expect(rows).toHaveLength(DISTINCT_SESSION_KEYS);
      const grouped = byKey(rows, SESSION_KEY);
      for (const [key, expectedRate] of Object.entries(BONUS_RATE_BY_SESSION_KEY)) {
        expect(Number(grouped.get(key)![AMOUNT_SUM])).toBeCloseTo(SUM_BY_SESSION_KEY[key], 6);
        // Per-group, not report-wide: GRAND_TOTAL_BONUS_RATE equals none of these three.
        expect(Number(grouped.get(key)![BONUS_RATE])).toBeCloseTo(expectedRate, 6);
        expect(expectedRate).not.toBeCloseTo(GRAND_TOTAL_BONUS_RATE, 6);
      }

      // The Totals exclusion is keyed on LEVEL, not on "calculated fields are never totalled":
      // the aggregate-level formula IS totalled here, at the grand-total grain, in the same block
      // the row-level one stays out of.
      const totals = await readTotals(storage.storageType, report);
      expect(totals).not.toBeNull();
      expect(Number(totals![BONUS_RATE])).toBeCloseTo(GRAND_TOTAL_BONUS_RATE, 6);
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(GRAND_TOTAL_SUM, 6);
      expect(Object.keys(totals!)).not.toContain(SESSION_KEY);
    }, 180000);

    // ── The same field on a report that LEFT JOINs another Data Mart ──────────────

    /**
     * One plain main column plus the row-level FORMULA as grain, with a JOINED
     * aggregate beside it. The metric sleeve must group by the formula's expression as well as by
     * `channel`; a sleeve that stops at `channel` joins back through `ANY_VALUE` and hands every
     * row its channel's whole revenue.
     */
    async function joinedGroupedReport(): Promise<ReportLikeReadPlan> {
      return buildReport({
        columnConfig: [CHANNEL, SESSION_KEY, ORDERS_REVENUE, 'amount'],
        aggregationConfig: [
          { column: ORDERS_REVENUE, function: 'SUM' },
          { column: 'amount', function: 'SUM' },
        ],
      });
    }

    it('gives the joined metric the formula grain, not a coarser sleeve grain', async () => {
      const rows = await readReportRows(storage.storageType, await joinedGroupedReport());

      // The rejected reading — GROUP BY channel, part_a, part_b — returns five rows, splitting
      // 'paid|xyz' back into its two inputs. The fixture exists so these counts differ.
      expect(Object.keys(JOINED_GROUPS)).toHaveLength(4);
      expect(JOINED_GROUPS_BY_INPUT_COLUMNS).not.toBe(Object.keys(JOINED_GROUPS).length);
      expect(rows).toHaveLength(Object.keys(JOINED_GROUPS).length);

      const grouped = new Map(rows.map(row => [joinedGroupKey(row), row]));
      expect([...grouped.keys()].sort()).toEqual(Object.keys(JOINED_GROUPS).sort());

      for (const [key, expected] of Object.entries(JOINED_GROUPS)) {
        const row = grouped.get(key)!;
        expect(Number(row[ORDERS_REVENUE_SUM])).toBeCloseTo(expected.revenue, 6);
        expect(Number(row[AMOUNT_SUM])).toBeCloseTo(expected.amount, 6);
        expect(Number(row[ROW_COUNT])).toBe(expected.rowCount);

        // THE falsification of this slice, measured rather than argued: at the coarse grain the
        // number is plausible, non-null and wrong. None of the four correct values equals the
        // channel-wide one it would have been replaced by.
        const coarse = JOINED_REVENUE_AT_CHANNEL_GRAIN[String(row[CHANNEL])];
        expect(expected.revenue).not.toBe(coarse);
        expect(Number(row[ORDERS_REVENUE_SUM])).not.toBeCloseTo(coarse, 6);
      }

      // 100 and 11 are produced ONLY by grouping on the columns the formula mentions.
      const revenues = rows.map(row => Number(row[ORDERS_REVENUE_SUM]));
      for (const wrong of JOINED_REVENUE_BY_INPUT_COLUMNS_ONLY) {
        expect(revenues).not.toContain(wrong);
      }
    }, 300000);

    it('projects the formula on an ungrouped joined report, per row', async () => {
      const report = await buildReport({
        columnConfig: [CHANNEL, SESSION_KEY, ORDERS_REVENUE],
      });

      const rows = await readReportRows(storage.storageType, report);

      // Before this work the field was absent from the SELECT entirely: a blank column on
      // BigQuery/Snowflake/Databricks and a throw on Athena/Redshift. Asserting the VALUES per row
      // is what separates "present" from "present and correct".
      expect(rows).toHaveLength(SOURCE_ROW_COUNT);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual([CHANNEL, ORDERS_REVENUE, SESSION_KEY].sort());
      }

      const asStrings = (r: { channel: string; session_key: string; revenue: number }): string =>
        `${r.channel}|${r.session_key}|${r.revenue}`;
      const actual = rows
        .map(row =>
          asStrings({
            channel: String(row[CHANNEL]),
            session_key: String(row[SESSION_KEY]),
            revenue: Number(row[ORDERS_REVENUE]),
          })
        )
        .sort();
      expect(actual).toEqual(UNGROUPED_JOINED_ROWS.map(asStrings).sort());
    }, 180000);

    it('restricts joined Totals to the groups the report shows (blended)', async () => {
      const report = await buildReport({
        columnConfig: [CHANNEL, SESSION_KEY, ORDERS_REVENUE, 'amount'],
        aggregationConfig: [
          { column: ORDERS_REVENUE, function: 'SUM' },
          { column: 'amount', function: 'SUM' },
        ],
        filterConfig: [
          { column: 'amount', operator: 'gt', value: HAVING_THRESHOLD, function: 'SUM' },
        ],
      });

      const rows = await readReportRows(storage.storageType, report);
      expect(rows.map(joinedGroupKey).sort()).toEqual(JOINED_KEPT_GROUP_KEYS);

      const totals = await readTotals(storage.storageType, report);
      expect(totals).not.toBeNull();
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(JOINED_KEPT_AMOUNT_TOTAL, 6);
      expect(Number(totals![ORDERS_REVENUE_SUM])).toBeCloseTo(JOINED_KEPT_REVENUE_TOTAL, 6);

      // At the coarse `channel` grain BOTH channels clear `SUM(amount) > 25`, so a restriction
      // that lost the formula key would keep every row and publish the unrestricted totals. These
      // two assertions are the difference between the restriction working and it being decorative.
      expect(Number(totals![AMOUNT_SUM])).not.toBeCloseTo(GRAND_TOTAL_SUM, 6);
      expect(Number(totals![ORDERS_REVENUE_SUM])).not.toBeCloseTo(JOINED_REVENUE_TRUE_TOTAL, 6);

      // Same row set as the report shows: the main column's visible values add up to the number
      // Totals publishes for it.
      const visibleAmount = rows.reduce((acc, row) => acc + Number(row[AMOUNT_SUM]), 0);
      expect(visibleAmount).toBeCloseTo(JOINED_KEPT_AMOUNT_TOTAL, 6);
    }, 300000);

    it('keeps the joined column above its true total when the grain is finer than the join key', async () => {
      const report = await joinedGroupedReport();
      const rows = await readReportRows(storage.storageType, report);
      const totals = await readTotals(storage.storageType, report);
      expect(totals).not.toBeNull();

      const revenueColumnSum = rows.reduce((acc, row) => acc + Number(row[ORDERS_REVENUE_SUM]), 0);
      const amountColumnSum = rows.reduce((acc, row) => acc + Number(row[AMOUNT_SUM]), 0);

      // Customer c3 appears under two different `channel` values, so its single order survives the
      // sleeve's DISTINCT once per (channel, session_key) tuple and is counted in both groups.
      expect(revenueColumnSum).toBeCloseTo(JOINED_REVENUE_COLUMN_SUM, 6);
      expect(Number(totals![ORDERS_REVENUE_SUM])).toBeCloseTo(JOINED_REVENUE_TRUE_TOTAL, 6);
      // NOT a defect — Totals is a separate dimensionless query and stays the joined mart's true
      // total. Pinned so that "reconciling" the two fails here instead of silently changing which
      // of the two numbers a report shows.
      expect(JOINED_REVENUE_COLUMN_SUM).not.toBe(JOINED_REVENUE_TRUE_TOTAL);
      expect(revenueColumnSum).not.toBeCloseTo(Number(totals![ORDERS_REVENUE_SUM]), 6);

      // The contrast that names the cause: a MAIN column cannot fan out across the join, so its
      // column and its total agree at exactly the same grain where the joined one does not.
      expect(amountColumnSum).toBeCloseTo(AMOUNT_COLUMN_SUM, 6);
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(AMOUNT_COLUMN_SUM, 6);
    }, 300000);

    // ── The REPORT aggregates the row-level field ────────────────────────────────

    /** Every group's numbers, keyed by the one ordinary column the report groups by. */
    function assertAggGroups(rows: Row[], expectRevenue: boolean): void {
      // Two rows, not five. A field left in the grouping keys does not merely mis-count — it
      // changes the SHAPE of the answer, and that is visible before any value is read.
      expect(rows).toHaveLength(Object.keys(AGG_GROUPS).length);
      expect(AGG_WRONG_GRAIN_ROWS).not.toBe(Object.keys(AGG_GROUPS).length);

      const grouped = byKey(rows, COUNTRY);
      expect([...grouped.keys()].sort()).toEqual(Object.keys(AGG_GROUPS).sort());
      // Every seeded row is behind one of the two groups — a half-loaded table would otherwise
      // make each number below wrong in the same direction and none of them obviously so.
      expect(rows.reduce((acc, row) => acc + Number(row[ROW_COUNT]), 0)).toBe(AGG_SOURCE_ROW_COUNT);

      for (const [country, expected] of Object.entries(AGG_GROUPS)) {
        const row = grouped.get(country)!;
        const distinct = Number(row[SESSION_KEY_COUNT_DISTINCT]);

        expect(distinct).toBe(expected.distinctSessionKeys);
        // The three readings the right answer has to be distinguished from, spelled out per group
        // because a fixture where any of them coincided would make this test decorative:
        //   1 — the field still in the GROUP BY, the whole point of this slice;
        expect(distinct).not.toBe(AGG_WRONG_GRAIN_DISTINCT);
        //   the row count — a COUNT that lost its DISTINCT;
        expect(distinct).not.toBe(expected.rowCount);
        expect(Number(row[ROW_COUNT])).toBe(expected.rowCount);
        //   the distinct INPUT combinations — counting the columns the formula mentions instead
        //   of the value it produces.
        expect(distinct).not.toBe(expected.distinctInputCombinations);

        expect(Number(row[AMOUNT_SUM])).toBeCloseTo(expected.amount, 6);
        // Grouping by the expression as well would publish one of these instead.
        expect(AGG_WRONG_GRAIN_AMOUNTS).not.toContain(expected.amount);

        if (expectRevenue) {
          expect(Number(row[ORDERS_REVENUE_SUM])).toBeCloseTo(expected.revenue, 6);
          expect(AGG_WRONG_GRAIN_REVENUES).not.toContain(expected.revenue);
          // The sleeve's de-duplication, measured: c1 is behind two US rows and c3 behind two UK
          // ones, so a sleeve that summed the joined column over the surviving MAIN rows reports
          // 241 / 78 here — a plausible number, no NULL and no warehouse error.
          expect(Number(row[ORDERS_REVENUE_SUM])).not.toBeCloseTo(
            AGG_REVENUE_WITHOUT_DEDUP[country],
            6
          );
        }
      }
    }

    it('aggregates the row-level field instead of grouping by it', async () => {
      const report = await buildAggReport({
        columnConfig: [COUNTRY, SESSION_KEY, 'amount'],
        aggregationConfig: [
          { column: SESSION_KEY, function: 'COUNT_DISTINCT' },
          { column: 'amount', function: 'SUM' },
        ],
      });

      const rows = await readReportRows(storage.storageType, report);

      assertAggGroups(rows, false);
      // The field is a METRIC of this query now: it comes back under the aggregated label and NOT
      // under its own name, which is what "it stopped being a grouping key" means in the output.
      for (const row of rows) {
        expect(Object.keys(row)).toContain(SESSION_KEY_COUNT_DISTINCT);
        expect(Object.keys(row)).not.toContain(SESSION_KEY);
      }
    }, 300000);

    it('keeps the aggregated field out of the sleeve grain on a joined report', async () => {
      const report = await buildAggReport({
        columnConfig: [COUNTRY, SESSION_KEY, ORDERS_REVENUE, 'amount'],
        aggregationConfig: [
          { column: SESSION_KEY, function: 'COUNT_DISTINCT' },
          { column: ORDERS_REVENUE, function: 'SUM' },
          { column: 'amount', function: 'SUM' },
        ],
      });

      // `SUM` over a joined column is sleeve-routed, so this report really does carry one — the
      // half the builder's count assertion guards, and the half a no-sleeve report cannot
      // exercise at all.
      expect(await composeReportSql(report)).toMatch(/\bsleeve_/);

      assertAggGroups(await readReportRows(storage.storageType, report), true);
    }, 300000);

    it('aggregates it on a BLENDED report carrying no sleeve at all', async () => {
      const report = await buildAggReport({
        columnConfig: [COUNTRY, SESSION_KEY, ORDERS_CUSTOMER_ID, 'amount'],
        aggregationConfig: [
          { column: SESSION_KEY, function: 'COUNT_DISTINCT' },
          // COUNT is the one joined aggregate `SLEEVE_ROUTING` maps to null, so no sleeve is built
          // — and with no sleeve, neither of the builder's grain assertions runs. What is left is
          // `MetricSleeveBuilder.buildAll`'s own guard, which fires before any sleeve exists.
          { column: ORDERS_CUSTOMER_ID, function: 'COUNT' },
          { column: 'amount', function: 'SUM' },
        ],
      });

      const sql = await composeReportSql(report);
      // Blended (it reads the joined mart through the WITH clause) and sleeve-free. Asserted on
      // the SQL because no returned number can show the absence of a CTE.
      expect(sql).toContain('WITH');
      expect(sql).not.toMatch(/\bsleeve_/);

      const rows = await readReportRows(storage.storageType, report);

      assertAggGroups(rows, false);
      // COUNT over a joined column counts the MAIN rows that survived the join, so it agrees with
      // the group's own row count — which is exactly the number the distinct count must not be.
      for (const [country, expected] of Object.entries(AGG_GROUPS)) {
        const row = byKey(rows, COUNTRY).get(country)!;
        expect(Number(row[ORDERS_CUSTOMER_ID_COUNT])).toBe(expected.rowCount);
      }
    }, 300000);

    it('publishes no Totals value for the aggregated field', async () => {
      const report = await buildAggReport({
        columnConfig: [COUNTRY, SESSION_KEY, 'amount'],
        aggregationConfig: [
          { column: SESSION_KEY, function: 'COUNT_DISTINCT' },
          { column: 'amount', function: 'SUM' },
        ],
      });

      const totals = await totalsService.computeTotals(report, ACCESSOR, storage.storageType);

      // The block itself is unaffected: still a grand total over all eight rows, and equal to no
      // group's value, so "no entry for the field" is not bought by breaking the rest.
      expect(totals).not.toBeNull();
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(AGG_GRAND_TOTAL_AMOUNT, 6);
      expect(Number(totals![`amount | AVG`])).toBeCloseTo(AGG_GRAND_TOTAL_AVG, 6);
      expect(Number(totals![`amount | MIN`])).toBeCloseTo(AGG_GRAND_TOTAL_MIN, 6);
      expect(Number(totals![`amount | MAX`])).toBeCloseTo(AGG_GRAND_TOTAL_MAX, 6);
      for (const group of Object.values(AGG_GROUPS)) {
        expect(Number(totals![AMOUNT_SUM])).not.toBeCloseTo(group.amount, 6);
      }

      // The exclusion as a NUMBER, not as a missing key: the four counts a Totals block could plausibly
      // carry for this field appear nowhere in it, under any name. A key check alone passes if the
      // count arrives labelled something else, and `deriveTotalsAggregations` is one deleted skip
      // away from publishing exactly these.
      const numbers = Object.values(totals!)
        .map(Number)
        .filter(value => Number.isFinite(value));
      for (const forbidden of [
        AGG_REPORT_WIDE_DISTINCT_SESSION_KEYS,
        AGG_SUM_OF_GROUP_DISTINCTS,
        ...Object.values(AGG_GROUPS).map(group => group.distinctSessionKeys),
      ]) {
        expect(numbers).not.toContain(forbidden);
      }
      for (const key of Object.keys(totals!)) {
        expect(key.startsWith(SESSION_KEY)).toBe(false);
      }
    }, 300000);

    // ── A formula referencing another formula ─────────────────────────────────────────────

    it('computes a formula over two aggregate-level formulas PER GROUP', async () => {
      const report = await buildReferenceReport({ columnConfig: [CHANNEL, ROAS] });

      const rows = await readReportRows(storage.storageType, report);

      // TWO rows, not one. The failure is the whole report collapsing to a grand total —
      // valid SQL, no error, no log line — so the row count is the first thing that shows it, and
      // a fixture with one group could not tell the two apart at all.
      expect(rows).toHaveLength(Object.keys(ROAS_BY_CHANNEL).length);
      const grouped = byKey(rows, CHANNEL);
      expect([...grouped.keys()].sort()).toEqual(Object.keys(ROAS_BY_CHANNEL).sort());

      for (const [channel, expectedRoas] of Object.entries(ROAS_BY_CHANNEL)) {
        const row = grouped.get(channel)!;
        expect(Number(row[ROAS])).toBeCloseTo(expectedRoas, 6);
        // And the VALUE, not only the shape: neither group's ratio is the collapsed one, so a
        // single row carrying 105/17 fails on the number as well as on the count.
        expect(expectedRoas).not.toBeCloseTo(ROAS_COLLAPSED, 6);
        expect(Number(row[ROAS])).not.toBeCloseTo(ROAS_COLLAPSED, 6);
        // `revenue` and `cost` are SUBSTITUTED into the expression, never projected beside
        // it. A dependency is not a column, in the Google Sheet or anywhere else.
        expect(Object.keys(row).sort()).toEqual([CHANNEL, ROAS].sort());
      }
      // The two groups differ from each other too, so neither can be read off the other.
      expect(ROAS_BY_CHANNEL.paid).not.toBeCloseTo(ROAS_BY_CHANNEL.organic, 6);

      // The collapsed value is a real number this report publishes — as its grand TOTAL, which is
      // where a dimensionless ratio belongs. Measuring it here is what shows the wrong answer
      // above would have been plausible rather than a NULL or an error.
      const totals = await readTotals(storage.storageType, report);
      expect(totals).not.toBeNull();
      expect(Number(totals![ROAS])).toBeCloseTo(ROAS_COLLAPSED, 6);
    }, 300000);

    it('keeps a row-level formula that reads another one as a grouping key', async () => {
      const report = await buildReferenceReport({
        columnConfig: [SESSION_UPPER, 'amount'],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
      });

      const rows = await readReportRows(storage.storageType, report);

      // Three rows: the grain is one per distinct value of the WHOLE chain. Not 4 (grouping by
      // the columns the chain mentions), not 5 (no grouping at all) and not 1 (the chain read as
      // an aggregate, which is what an inherited level would make of `UPPER(<row-level>)`).
      expect(rows).toHaveLength(Object.keys(SUM_BY_SESSION_UPPER).length);
      expect(Object.keys(SUM_BY_SESSION_UPPER).length).not.toBe(DISTINCT_INPUT_COMBINATIONS);
      const grouped = byKey(rows, SESSION_UPPER);
      expect([...grouped.keys()].sort()).toEqual(Object.keys(SUM_BY_SESSION_UPPER).sort());

      for (const [key, expectedSum] of Object.entries(SUM_BY_SESSION_UPPER)) {
        const row = grouped.get(key)!;
        expect(Number(row[AMOUNT_SUM])).toBeCloseTo(expectedSum, 6);
        expect(Number(row[ROW_COUNT])).toBe(ROW_COUNT_BY_SESSION_UPPER[key]);
        // The field it reads is not a column of this report.
        expect(Object.keys(row).sort()).toEqual([SESSION_UPPER, AMOUNT_SUM, ROW_COUNT].sort());
      }
      const sums = rows.map(row => Number(row[AMOUNT_SUM]));
      for (const wrongSum of SUM_BY_INPUT_COMBINATION_ONLY) {
        expect(sums).not.toContain(wrongSum);
      }

      // Still a DIMENSION at the Totals seat, which re-derives the level rather than reading the
      // cache: admitted there, the Totals query would group by the chain's expression and publish
      // one arbitrary group's amount as the report-wide total.
      const totals = await readTotals(storage.storageType, report);
      expect(totals).not.toBeNull();
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(GRAND_TOTAL_SUM, 6);
      for (const groupSum of Object.values(SUM_BY_SESSION_UPPER)) {
        expect(Number(totals![AMOUNT_SUM])).not.toBeCloseTo(groupSum, 6);
      }
      for (const key of Object.keys(totals!)) {
        expect(key.startsWith(SESSION_UPPER)).toBe(false);
        expect(key.startsWith(SESSION_KEY)).toBe(false);
      }
    }, 300000);

    it('never projects a formula the selected one merely reads', async () => {
      const sql = await composeReportSql(
        await buildReferenceReport({ columnConfig: [CHANNEL, ROAS] })
      );
      // Asserted on the SQL because an ABSENT column cannot be read off returned rows: the
      // dependency's aggregate call is in the query, its NAME is not an output of it. Both quote
      // characters, since the five dialects disagree on which one they use.
      expect(sql).toMatch(/AS\s+["`]roas["`]/i);
      expect(sql).not.toMatch(/AS\s+["`]revenue["`]/i);
      expect(sql).not.toMatch(/AS\s+["`]cost["`]/i);

      // The row-level chain, on the PLAIN shape: one row per source row and B nowhere beside A —
      // the same claim where a wildcard expansion, not a GROUP BY, would be what widened it.
      const rows = await readReportRows(
        storage.storageType,
        await buildReferenceReport({ columnConfig: [SESSION_UPPER] })
      );
      expect(rows).toHaveLength(SOURCE_ROW_COUNT);
      for (const row of rows) {
        expect(Object.keys(row)).toEqual([SESSION_UPPER]);
      }
      expect(rows.map(row => String(row[SESSION_UPPER])).sort()).toEqual(
        [...SESSION_UPPER_OF_EVERY_ROW].sort()
      );
    }, 300000);

    it('computes it beside a joined metric on a BLENDED report', async () => {
      const report = await buildReferenceReport({
        columnConfig: [CHANNEL, ROAS, ORDERS_REVENUE],
        aggregationConfig: [{ column: ORDERS_REVENUE, function: 'SUM' }],
      });

      // The blended builder projects the main CTE from the SELECTED plans, so `amount` and `bonus`
      // reach the outer SELECT only because the dependency closure travels with `roas`. Without
      // that, the CTE projects the two formula NAMES and every dialect answers `Unrecognized name`
      // — an error, but one no unit test on this branch executes.
      const sql = await composeReportSql(report);
      expect(sql).toContain('WITH');

      const rows = await readReportRows(storage.storageType, report);

      expect(rows).toHaveLength(Object.keys(ROAS_BY_CHANNEL).length);
      const grouped = byKey(rows, CHANNEL);
      expect([...grouped.keys()].sort()).toEqual(Object.keys(ROAS_BY_CHANNEL).sort());

      for (const [channel, expectedRoas] of Object.entries(ROAS_BY_CHANNEL)) {
        const row = grouped.get(channel)!;
        expect(Number(row[ROAS])).toBeCloseTo(expectedRoas, 6);
        expect(Number(row[ROAS])).not.toBeCloseTo(ROAS_COLLAPSED, 6);
        // The report's grain IS `channel` here, so the joined metric's channel-grain revenue —
        // the WRONG number in the joined-grain test above, where the grain was finer — is the right one.
        expect(Number(row[ORDERS_REVENUE_SUM])).toBeCloseTo(
          JOINED_REVENUE_AT_CHANNEL_GRAIN[channel],
          6
        );
        expect(Number(row[ROW_COUNT])).toBe(ROW_COUNT_BY_CHANNEL[channel]);
        expect(Object.keys(row).sort()).toEqual(
          [CHANNEL, ROAS, ORDERS_REVENUE_SUM, ROW_COUNT].sort()
        );
      }
    }, 300000);

    // ── The date bucket, and the declared type reaching the warehouse ────────────

    /** The save-time seat, on this storage's own actualized Data Mart. */
    async function validateReport(report: ReportLikeReadPlan): Promise<void> {
      await validator.validateForReport({
        storageType: storage.storageType,
        dataMartId: report.dataMart.id,
        projectId: NULL_IDP_PROJECT_ID,
        columnConfig: report.columnConfig,
        filterConfig: report.filterConfig,
        sortConfig: report.sortConfig,
        limitConfig: report.limitConfig,
        aggregationConfig: report.aggregationConfig,
        dateTruncConfig: report.dateTruncConfig,
        accessor: ACCESSOR,
        dataMartSchemaFields: report.dataMart.schema?.fields,
      });
    }

    /** The codes `validateForReport` refused a report with, or `[]` when it accepted it. */
    async function validationCodesOf(report: ReportLikeReadPlan): Promise<string[]> {
      try {
        await validateReport(report);
        return [];
      } catch (error) {
        const response = (error as BadRequestException).getResponse() as {
          details?: { errors?: { code: string }[] };
        };
        return (response.details?.errors ?? []).map(entry => entry.code);
      }
    }

    it('buckets a DATE-declared row-level formula by MONTH', async () => {
      const bucketed = await buildBucketReport({
        columnConfig: [EVENT_MONTH, 'amount'],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
        dateTruncConfig: [{ column: EVENT_MONTH, unit: 'MONTH' }],
      });

      // The seat this slice lifted is a SAVE-time refusal, and no returned row can show that it is
      // gone: this exact configuration used to be rejected with CALCULATED_FIELD_AS_DIMENSION
      // and the report could not be created at all.
      expect(await validationCodesOf(bucketed)).toEqual([]);

      const rows = await readReportRows(storage.storageType, bucketed);
      expect(rows).toHaveLength(Object.keys(BUCKET_GROUPS).length);

      for (const [month, expected] of Object.entries(BUCKET_GROUPS)) {
        const row = rowForMonth(rows, EVENT_MONTH, month);
        expect(`${month}: ${Number(row[AMOUNT_SUM])}`).toBe(`${month}: ${expected.amount}`);
        expect(Number(row[ROW_COUNT])).toBe(expected.rowCount);
      }
      // Every seeded row is behind one of the three buckets — a half-loaded table would otherwise
      // make each number above wrong in the same direction and none of them obviously so.
      expect(rows.reduce((acc, row) => acc + Number(row[ROW_COUNT]), 0)).toBe(
        BUCKET_SOURCE_ROW_COUNT
      );

      // Neither column the formula reads produces these three numbers: bucketing the raw
      // `event_date` publishes a NULL group and 1/9/19/18, the raw `fallback_date` 25/12/10. The
      // COALESCE is what the warehouse has to evaluate before truncating, and this is what says so.
      const sums = rows.map(row => Number(row[AMOUNT_SUM]));
      for (const wrong of [
        ...BUCKET_AMOUNTS_BY_RAW_EVENT_DATE,
        ...BUCKET_AMOUNTS_BY_RAW_FALLBACK_DATE,
      ]) {
        expect(sums).not.toContain(wrong);
      }
      expect(sums.reduce((acc, value) => acc + value, 0)).toBeCloseTo(BUCKET_GRAND_TOTAL_AMOUNT, 6);

      // The SAME report without the bucket, executed rather than reasoned about: all nine
      // effective dates are distinct, so the truncation is the only thing between 9 rows and 3.
      const unbucketed = await readReportRows(
        storage.storageType,
        await buildBucketReport({
          columnConfig: [EVENT_MONTH, 'amount'],
          aggregationConfig: [{ column: 'amount', function: 'SUM' }],
        })
      );
      expect(BUCKET_DISTINCT_EFFECTIVE_DATES).not.toBe(Object.keys(BUCKET_GROUPS).length);
      expect(unbucketed).toHaveLength(BUCKET_DISTINCT_EFFECTIVE_DATES);
      expect(unbucketed.reduce((acc, row) => acc + Number(row[AMOUNT_SUM]), 0)).toBeCloseTo(
        BUCKET_GRAND_TOTAL_AMOUNT,
        6
      );
    }, 300000);

    it('reproduces the bucket inside the metric sleeve on a blended report', async () => {
      const report = await buildBucketReport({
        columnConfig: [EVENT_MONTH, ORDERS_CUSTOMER_ID, 'amount'],
        aggregationConfig: [
          // COUNT_DISTINCT deliberately, not SUM: it is the only joined aggregate whose sleeve is
          // a COUNTING one, and the only one whose join-back miss reads as a confident 0 — every
          // other shape announces itself as NULL.
          { column: ORDERS_CUSTOMER_ID, function: 'COUNT_DISTINCT' },
          { column: 'amount', function: 'SUM' },
        ],
        dateTruncConfig: [{ column: EVENT_MONTH, unit: 'MONTH' }],
      });

      expect(await validationCodesOf(report)).toEqual([]);
      expect(await composeReportSql(report)).toMatch(/\bsleeve_/);

      const rows = await readReportRows(storage.storageType, report);
      expect(rows).toHaveLength(Object.keys(BUCKET_GROUPS).length);

      for (const [month, expected] of Object.entries(BUCKET_GROUPS)) {
        const row = rowForMonth(rows, EVENT_MONTH, month);
        const distinct = Number(row[ORDERS_CUSTOMER_ID_COUNT_DISTINCT]);

        // The equality above is what catches an untruncated sleeve: with both guards removed,
        // BigQuery published 1 here for May. See `SLEEVE_MISS_DISTINCT_COUNT` for the other reading
        // of the same miss, which this line keeps pinned.
        expect(`${month}: ${distinct}`).toBe(`${month}: ${expected.distinctCustomers}`);
        expect(distinct).not.toBe(SLEEVE_MISS_DISTINCT_COUNT);
        // A COUNT that lost its DISTINCT, and the de-duplication the fixture keeps live: c1
        // repeats inside May and c2 inside September.
        expect(distinct).not.toBe(expected.rowCount);
        expect(Number(row[ROW_COUNT])).toBe(expected.rowCount);
        // The report-wide count, which is what a sleeve at NO grain at all would spread everywhere.
        expect(distinct).not.toBe(BUCKET_REPORT_WIDE_DISTINCT_CUSTOMERS);
        expect(Number(row[AMOUNT_SUM])).toBeCloseTo(expected.amount, 6);
      }

      // Distinct counts do not add up, so the three per-bucket answers cannot be read off the
      // report-wide one in either direction.
      expect(
        rows.reduce((acc, row) => acc + Number(row[ORDERS_CUSTOMER_ID_COUNT_DISTINCT]), 0)
      ).toBe(BUCKET_SUM_OF_GROUP_DISTINCTS);
      expect(BUCKET_SUM_OF_GROUP_DISTINCTS).not.toBe(BUCKET_REPORT_WIDE_DISTINCT_CUSTOMERS);
    }, 300000);

    it('sums a numeric-string formula at the DECLARED precision', async () => {
      const asFloat = await sumOfCalculatedField(NUM_FLOAT);
      expect(asFloat).toBeCloseTo(NUMERIC_STRING_TRUE_SUM, 6);
      // Redshift coerced the varchar to `Decimal` at scale 0 and published the truncated total for
      // this exact shape; BigQuery and Athena refused it outright. Both are what the cast changed.
      expect(asFloat).not.toBeCloseTo(NUMERIC_STRING_TRUNCATED_SUM, 6);

      // Every exact-decimal spelling this dialect has, because they resolve to different cast
      // targets and a map entry that is merely PRESENT proves nothing about what it produces.
      for (const [index, declaredType] of storage.exactTypes.entries()) {
        const asExact = await sumOfCalculatedField(exactFieldName(index));
        expect(`${declaredType}: ${asExact}`).toBe(`${declaredType}: ${NUMERIC_STRING_TRUE_SUM}`);
      }

      // Executed: a declared float never casts to a 32-bit target. Ten significant digits
      // survive the round trip, which is the only thing that tells `REAL` from `DOUBLE` apart —
      // every other number in this fixture is exact in both widths.
      expect(`${storage.narrowFloatType}: ${await sumOfCalculatedField(WIDE_FLOAT)}`).toBe(
        `${storage.narrowFloatType}: ${WIDE_FLOAT_TRUE_SUM}`
      );
    }, 300000);

    it('leaves an INTEGER declaration uncast, over a float and over text alike', async () => {
      const asFloat = await sumOfCalculatedField(HALF_FLOAT);
      const asInteger = await sumOfCalculatedField(HALF_INT);

      expect(asFloat).toBeCloseTo(HALF_TRUE_SUM, 6);
      // The same number under both declarations, which is the whole of the integer rule: the integer branch
      // emits no cast, so the per-row conversion the dialects disagree about never happens.
      expect(asInteger).toBeCloseTo(HALF_TRUE_SUM, 6);
      expect(asInteger).not.toBeCloseTo(HALF_SUM_IF_ROUNDED_PER_ROW, 6);
      expect(asInteger).not.toBeCloseTo(HALF_SUM_IF_TRUNCATED_PER_ROW, 6);

      // The one named COST, measured rather than argued: the same declaration over TEXT keeps
      // doing exactly what it did before the slice — raising on the two strict dialects, and
      // truncating on Redshift, where a FLOAT declaration now returns the true total instead.
      if (storage.integerOverTextSum === 'error') {
        await expect(sumOfCalculatedField(NUM_INT)).rejects.toThrow();
      } else {
        expect(await sumOfCalculatedField(NUM_INT)).toBeCloseTo(storage.integerOverTextSum, 6);
      }
    }, 300000);

    it('raises rather than rounds where an exact declaration cannot hold the value', async () => {
      // The same value under a FLOAT declaration still sums, so what follows is the exact-decimal
      // trade and not a broken fixture. Compared as a ratio: an absolute tolerance around 9e30
      // would accept answers that are wrong by more than the whole fixture.
      expect((await sumOfCalculatedField(BIG_FLOAT)) / BIG_VALUE_TRUE_SUM).toBeCloseTo(1, 9);
      // 1e30 is past DECIMAL(38,18)'s ~1e20 and NUMERIC(38,9)'s ~1e29 alike. Kept deliberately as
      // a loud error at an extreme value rather than a silently rounded one.
      await expect(sumOfCalculatedField(BIG_EXACT)).rejects.toThrow();
    }, 300000);

    it('refuses a joined Data Mart calculated field named after a real column of that table', async () => {
      // The QUIET shape: the joined TABLE really carries a `ctr` column, so the SQL a missing
      // refusal composes is valid and returns 0.11 / 0.22 / 0.33 / 0.44 where the formula means
      // 200 / 22 / 60 / 14. No warehouse error stands between the analyst and that.
      expect(Object.values(ORDER_CTR_BY_CUSTOMER)).not.toEqual(
        Object.values(ORDERS_CTR_FORMULA_BY_CUSTOMER)
      );

      await expect(
        readReportRows(
          storage.storageType,
          await buildRefusalReport({ columnConfig: ['customer_id', JOINED_CTR] })
        )
      ).rejects.toThrow(/is a calculated field of the joined Data Mart/);

      // And on the surface that reaches SAVE, where the report's own output controls have already
      // paid for the blendable schema this refusal reads.
      expect(
        await validationCodesOf(
          await buildRefusalReport({
            columnConfig: ['customer_id', JOINED_CTR],
            aggregationConfig: [{ column: JOINED_CTR, function: 'SUM' }],
          })
        )
      ).toContain('JOINED_CALCULATED_FIELD_UNSUPPORTED');
    }, 180000);

    // This test used to ask the warehouses what they made of the shape, and on 2026-08-24 Snowflake
    // answered: `DATE_TRUNC('MONTH', CONVERT_TIMEZONE('America/New_York', CONCAT(…)))` over
    // `05/08/2026` returned ONE row bucketed at `2026-05-01T04:00:00Z` — the 8th of May, where the
    // formula means the 5th of August. No error, no NULL, one plausible month. `CONVERT_TIMEZONE`
    // is the only string shape Snowflake returns a value for at all, so the zone is the door, and
    // MDY is a session default rather than anything in the data — two Snowflake accounts would
    // disagree about the same report. The product owner ruled the leg refused on all five storages,
    // so the shape can no longer reach a warehouse and there is nothing left to measure.
    // The value stays written down here because the rule exists for it, not out of caution.
    it('refuses the day-ambiguous time-zone shape before it reaches the warehouse', async () => {
      const report = await buildBucketReport({
        columnConfig: [AMBIGUOUS_TS, 'amount'],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
        dateTruncConfig: [{ column: AMBIGUOUS_TS, unit: 'MONTH', timeZone: AMBIGUOUS_TIME_ZONE }],
      });

      expect(await validationCodesOf(report)).toContain('DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD');
      // The run path, not only the save: `resolveBlendingDecision` validates before it composes any
      // SQL, so this rejects without a warehouse round trip. That is the assertion — the query is
      // never built, so no dialect gets the chance to read the string its own way.
      await expect(readReportRows(storage.storageType, report)).rejects.toThrow();

      // The scope of the refusal, on the same field and the same warehouse: only the zone goes. A
      // MONTH bucket on the identical TIMESTAMP-declared formula is the feature this branch
      // shipped, and it still saves.
      expect(
        await validationCodesOf(
          await buildBucketReport({
            columnConfig: [AMBIGUOUS_TS, 'amount'],
            aggregationConfig: [{ column: 'amount', function: 'SUM' }],
            dateTruncConfig: [{ column: AMBIGUOUS_TS, unit: 'MONTH' }],
          })
        )
      ).toEqual([]);
    }, 300000);

    // ── Item 15: FILTERS on a Calculated Field, executed ──────────────────────────────────
    //
    // Every claim this half makes was pinned as an emitted SQL STRING per dialect and executed against nothing; the
    // twelve tests below execute them. Each is a DIFFERENT kind of claim and none subsumes
    // another: the clause (WHERE against HAVING), the reach (outer query against metric sleeve),
    // the channel (selected against filtered-only), and the TYPE the comparison runs under.

    /** `filter_key = 'pqr'` — the one row-level predicate the blended pair is built on. */
    const keyFilterRule = {
      column: FILTER_KEY,
      operator: 'eq' as const,
      value: FILTER_KEY_VALUE,
    };

    /**
     * The blended report: two joined metrics beside a main one, at the `grp` grain. `COUNT_DISTINCT`
     * is the load-bearing one — a sleeve the predicate never reached answers a CONFIDENT number
     * here (the unfiltered count) rather than the NULL every other joined shape would announce.
     */
    async function blendedFilterReport(
      columnConfig: string[],
      filtered: boolean
    ): Promise<ReportLikeReadPlan> {
      return buildFilterReport({
        columnConfig,
        aggregationConfig: [
          { column: ORDERS_CUSTOMER_ID, function: 'COUNT_DISTINCT' },
          { column: ORDERS_REVENUE, function: 'SUM' },
          { column: 'amount', function: 'SUM' },
        ],
        ...(filtered ? { filterConfig: [keyFilterRule] } : {}),
      });
    }

    function assertFilterGroups(
      rows: Row[],
      expected: Record<string, FilterGroup>,
      /** Distinct customers over the rows THIS report reads — 3 filtered, 4 unfiltered. */
      reportWideDistinct: number
    ): void {
      expect(rows).toHaveLength(Object.keys(expected).length);
      const grouped = byKey(rows, FILTER_GRP);
      expect([...grouped.keys()].sort()).toEqual(Object.keys(expected).sort());

      for (const [key, group] of Object.entries(expected)) {
        const row = grouped.get(key)!;
        const distinct = Number(row[ORDERS_CUSTOMER_ID_COUNT_DISTINCT]);

        expect(`${key}: ${distinct}`).toBe(`${key}: ${group.distinctCustomers}`);
        // The three readings the right answer has to be told apart from, per group:
        //   0 — the join-back matching no sleeve row at all, COALESCEd by the counting pull;
        expect(distinct).not.toBe(0);
        //   the row count — a COUNT that lost its DISTINCT (a customer repeats in BOTH groups);
        expect(distinct).not.toBe(group.rowCount);
        expect(Number(row[ROW_COUNT])).toBe(group.rowCount);
        //   the whole report's distinct customers, which a sleeve at no grain spreads everywhere.
        expect(distinct).not.toBe(reportWideDistinct);

        expect(Number(row[ORDERS_REVENUE_SUM])).toBeCloseTo(group.revenue, 6);
        // The sleeve's de-duplication, measured: c1 is behind two g1 rows and c4 behind two g2
        // ones, so a sleeve that summed the joined column over the surviving MAIN rows reports
        // these instead — a plausible number, no NULL and no warehouse error.
        expect(Number(row[ORDERS_REVENUE_SUM])).not.toBeCloseTo(group.revenueWithoutDedup, 6);
        expect(Number(row[AMOUNT_SUM])).toBeCloseTo(group.amount, 6);
      }
    }

    it('filters a PLAIN report by a row-level calculated field (outer WHERE)', async () => {
      // The control: the formula's own values per row, so a concat that lost a half fails HERE
      // rather than turning every filtered answer below into a mystery.
      const unfiltered = await readReportRows(
        storage.storageType,
        await buildFilterReport({ columnConfig: [FILTER_KEY, 'amount'] })
      );
      expect(unfiltered).toHaveLength(FILTER_SOURCE_ROW_COUNT);
      expect(unfiltered.map(row => String(row[FILTER_KEY])).sort()).toEqual(
        [...FILTER_KEYS_OF_EVERY_ROW].sort()
      );

      const rows = await readReportRows(
        storage.storageType,
        await buildFilterReport({
          columnConfig: [FILTER_KEY, 'amount'],
          filterConfig: [keyFilterRule],
        })
      );

      const amounts = rows.map(row => Number(row.amount)).sort((a, b) => a - b);
      expect(amounts).toEqual(FILTER_KEPT_AMOUNTS);
      for (const row of rows) {
        expect(String(row[FILTER_KEY])).toBe(FILTER_KEY_VALUE);
      }
      // A predicate that never reached the warehouse returns all eight.
      for (const dropped of FILTER_DROPPED_AMOUNTS) {
        expect(amounts).not.toContain(dropped);
      }
      // And a predicate applied to the COLUMNS the formula mentions instead of to its VALUE loses
      // exactly these two rows: they carry `ka = 'pq'`, `kb = 'r'` and reach 'pqr' only as an
      // expression. Their presence is what separates the two readings.
      for (const expressionOnly of FILTER_EXPRESSION_ONLY_AMOUNTS) {
        expect(amounts).toContain(expressionOnly);
      }
    }, 300000);

    it('filters a BLENDED joined COUNT_DISTINCT by a SELECTED calculated field', async () => {
      const columns = [FILTER_GRP, FILTER_KEY, ORDERS_CUSTOMER_ID, ORDERS_REVENUE, 'amount'];
      const report = await blendedFilterReport(columns, true);

      // Without a sleeve nothing below is about a sleeve — #6766's C1 was a sleeve building
      // `FROM main` unfiltered, and only a sleeve can reproduce that.
      expect(await composeReportSql(report)).toMatch(/\bsleeve_/);

      const rows = await readReportRows(storage.storageType, report);
      assertFilterGroups(rows, FILTER_GROUPS_FILTERED, FILTER_KEPT_REPORT_WIDE_DISTINCT);
      for (const row of rows) {
        expect(String(row[FILTER_KEY])).toBe(FILTER_KEY_VALUE);
      }

      // MEASURED, by mutation, and it is why the next test exists rather than being a variation on
      // this one: with the filtered field SELECTED it is a grouping key, so it is part of the
      // SLEEVE's grain too — the outer query joins the sleeve back on (grp, filter_key) and only
      // the 'pqr' tuples survive the outer WHERE. Emptying `renderSleeveWhere` entirely does NOT
      // move a number here. The sleeve's own copy of the predicate is load-bearing only when the
      // field is NOT selected, which is the test below.
      //
      // THE failure this test exists for, named per group: a sleeve computed over UNFILTERED rows
      // answers 3 and 3 — both plausible, neither NULL, and neither equal to the right answer.
      for (const [key, group] of Object.entries(FILTER_GROUPS_FILTERED)) {
        const unfilteredGroup = FILTER_GROUPS_UNFILTERED[key];
        expect(group.distinctCustomers).not.toBe(unfilteredGroup.distinctCustomers);
        expect(group.revenue).not.toBe(unfilteredGroup.revenue);
        const row = byKey(rows, FILTER_GRP).get(key)!;
        expect(Number(row[ORDERS_CUSTOMER_ID_COUNT_DISTINCT])).not.toBe(
          unfilteredGroup.distinctCustomers
        );
        expect(Number(row[ORDERS_REVENUE_SUM])).not.toBeCloseTo(unfilteredGroup.revenue, 6);
      }
    }, 300000);

    it('applies the same predicate when the calculated field is NOT selected', async () => {
      const columns = [FILTER_GRP, ORDERS_CUSTOMER_ID, ORDERS_REVENUE, 'amount'];
      const report = await blendedFilterReport(columns, true);

      // `SleeveCalculatedDimensions.plans` holds grouping-key plans only and
      // `collectReportDimensions` sees selected columns only, so a field that is FILTERED but not
      // SELECTED has no plan at the sleeve and its formula's columns are not projected into the
      // main raw CTE. Two real defects were this shape.
      //
      // This is the ONLY one of the two blended shapes whose answer the sleeve's own predicate
      // decides. Falsified live on BigQuery and Redshift: emptying `renderSleeveWhere` makes g1
      // read 3 where 2 is correct — the unfiltered count, a confident number and not a NULL.
      const rows = await readReportRows(storage.storageType, report);
      assertFilterGroups(rows, FILTER_GROUPS_FILTERED, FILTER_KEPT_REPORT_WIDE_DISTINCT);
      for (const row of rows) {
        expect(Object.keys(row)).not.toContain(FILTER_KEY);
      }

      // The unfiltered twin, EXECUTED rather than quoted: this is the exact row set a sleeve that
      // never received the predicate publishes.
      const unfiltered = await readReportRows(
        storage.storageType,
        await blendedFilterReport(columns, false)
      );
      assertFilterGroups(
        unfiltered,
        FILTER_GROUPS_UNFILTERED,
        FILTER_UNFILTERED_REPORT_WIDE_DISTINCT
      );

      // Totals is a separate dimensionless query and must carry the same predicate.
      const totals = await readTotals(storage.storageType, report);
      expect(totals).not.toBeNull();
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(FILTER_KEPT_TOTAL_AMOUNT, 6);
      expect(Number(totals![AMOUNT_SUM])).not.toBeCloseTo(FILTER_GRAND_TOTAL_AMOUNT, 6);
      expect(Number(totals![ORDERS_REVENUE_SUM])).toBeCloseTo(FILTER_KEPT_REVENUE_TOTAL, 6);
      expect(Number(totals![ORDERS_REVENUE_SUM])).not.toBeCloseTo(
        FILTER_UNFILTERED_REVENUE_TOTAL,
        6
      );
    }, 300000);

    it('filters GROUPS by an aggregate-level calculated field and restricts Totals', async () => {
      const bonusRule = {
        column: FILTER_BONUS_TOTAL,
        operator: 'gt' as const,
        value: FILTER_BONUS_THRESHOLD,
      };
      const report = await buildFilterReport({
        columnConfig: [FILTER_GRP, FILTER_BONUS_TOTAL, 'amount'],
        aggregationConfig: [{ column: 'amount', function: 'SUM' }],
        filterConfig: [bonusRule],
      });

      const rows = await readReportRows(storage.storageType, report);
      expect(rows).toHaveLength(1);
      expect(String(rows[0][FILTER_GRP])).toBe(FILTER_HAVING_KEPT_GROUP);
      expect(Number(rows[0][FILTER_BONUS_TOTAL])).toBeCloseTo(FILTER_HAVING_KEPT_BONUS, 6);
      expect(Number(rows[0][AMOUNT_SUM])).toBeCloseTo(FILTER_HAVING_KEPT_AMOUNT, 6);
      // `bonus` is ranked OPPOSITE to `amount` across the two groups, so a HAVING that had
      // silently compared the report's own `SUM(amount)` against the same threshold keeps the
      // OTHER group. The two mistakes return different answers rather than the same one.
      expect(FILTER_GROUPS_UNFILTERED.g1.amount).toBeGreaterThan(FILTER_BONUS_THRESHOLD);
      expect(FILTER_GROUPS_UNFILTERED.g2.amount).toBeLessThan(FILTER_BONUS_THRESHOLD);
      expect(FILTER_BONUS_BY_GROUP[FILTER_HAVING_KEPT_GROUP]).toBeGreaterThan(
        FILTER_BONUS_THRESHOLD
      );

      // The silent one: `GroupRestriction.having` used to be DEFINED as "the rules carrying a
      // function", and an aggregate-level Calculated Field's rule carries none — so a report whose
      // only metric filter is this one built NO restriction and Totals covered the rows the report
      // hides, with no error.
      const totals = await readTotals(storage.storageType, report);
      expect(totals).not.toBeNull();
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(FILTER_HAVING_KEPT_AMOUNT, 6);
      expect(Number(totals![FILTER_BONUS_TOTAL])).toBeCloseTo(FILTER_HAVING_KEPT_BONUS, 6);
      expect(Number(totals![AMOUNT_SUM])).not.toBeCloseTo(FILTER_GRAND_TOTAL_AMOUNT, 6);
      expect(Number(totals![FILTER_BONUS_TOTAL])).not.toBeCloseTo(FILTER_GRAND_TOTAL_BONUS, 6);
      // And Totals is exactly what the one visible row adds up to — same rows, same number.
      expect(Number(totals![AMOUNT_SUM])).toBeCloseTo(Number(rows[0][AMOUNT_SUM]), 6);

      // The same predicate with the field NOT selected — the shape that took the plain branch,
      // where `assertNoHavingRules` turned a 400 into a 500 until the shape gate closed it.
      const unselected = await readReportRows(
        storage.storageType,
        await buildFilterReport({
          columnConfig: [FILTER_GRP, 'amount'],
          aggregationConfig: [{ column: 'amount', function: 'SUM' }],
          filterConfig: [bonusRule],
        })
      );
      expect(unselected).toHaveLength(1);
      expect(String(unselected[0][FILTER_GRP])).toBe(FILTER_HAVING_KEPT_GROUP);
      expect(Number(unselected[0][AMOUNT_SUM])).toBeCloseTo(FILTER_HAVING_KEPT_AMOUNT, 6);
      expect(Object.keys(unselected[0])).not.toContain(FILTER_BONUS_TOTAL);
    }, 300000);

    it('compares a FLOAT-declared TEXT formula as a NUMBER (the measured wrong subset)', async () => {
      const all = await readReportRows(
        storage.storageType,
        await buildFilterReport({ columnConfig: [FILTER_NUM] })
      );
      expect(all.map(row => String(row[FILTER_NUM])).sort()).toEqual([...FILTER_NUM_VALUES].sort());

      const rows = await readReportRows(
        storage.storageType,
        await buildFilterReport({
          columnConfig: [FILTER_NUM, 'amount'],
          filterConfig: [{ column: FILTER_NUM, operator: 'gt', value: FILTER_NUM_THRESHOLD }],
        })
      );

      // THE headline of this gate. `'9'`, `'10'`, `'100'` filtered `> 5`: three rows read as
      // numbers, exactly ONE read as text — `'9' > '5'` is the only true lexicographic comparison
      // in the set. Redshift returned that single row, with no error and no NULL, and the two
      // largest values missing. The cast rule exists to remove exactly this subset.
      expect(rows.map(row => String(row[FILTER_NUM])).sort()).toEqual([
        ...FILTER_NUM_ABOVE_THRESHOLD,
      ]);
      expect(rows).toHaveLength(FILTER_NUM_ABOVE_THRESHOLD.length);
      expect(FILTER_NUM_LEXICOGRAPHIC_ANSWER).toHaveLength(1);
      expect(FILTER_NUM_ABOVE_THRESHOLD).not.toEqual(FILTER_NUM_LEXICOGRAPHIC_ANSWER);
      expect(rows.reduce((acc, row) => acc + Number(row.amount), 0)).toBeCloseTo(
        FILTER_NUM_ABOVE_AMOUNT,
        6
      );
    }, 300000);

    it("answers `= 10` and `= '10'` alike over one FLOAT-declared field", async () => {
      const readEquality = async (value: number | string): Promise<Row[]> =>
        readReportRows(
          storage.storageType,
          await buildFilterReport({
            columnConfig: [FILTER_NUM, 'amount'],
            filterConfig: [{ column: FILTER_NUM, operator: 'eq', value }],
          })
        );

      // Only the value's JS type differs. Nothing in the filter path consulted the declaration
      // before this slice, so on BigQuery and Athena these two flipped between a hard error and
      // the right answer over the SAME field.
      const asNumber = await readEquality(10);
      const asString = await readEquality('10');

      for (const [label, rows] of [
        ['number', asNumber],
        ['string', asString],
      ] as const) {
        expect(`${label}: ${rows.length}`).toBe(`${label}: 1`);
        expect(`${label}: ${String(rows[0][FILTER_NUM])}`).toBe(
          `${label}: ${FILTER_NUM_EQUALITY_VALUE}`
        );
        expect(Number(rows[0].amount)).toBeCloseTo(FILTER_NUM_EQUALITY_AMOUNT, 6);
      }
    }, 300000);

    it("matches a NON-canonical spelling under equality (`'9.0' = 9`)", async () => {
      // The cheapest unmeasured cell the design named: `'9.0' = 9` is TRUE numerically and FALSE
      // lexicographically, so the fixture's canonical spellings could not tell the two apart.
      const rows = await readReportRows(
        storage.storageType,
        await buildFilterReport({
          columnConfig: [FILTER_SPELLED, 'amount'],
          filterConfig: [{ column: FILTER_SPELLED, operator: 'eq', value: 9 }],
        })
      );

      expect(rows).toHaveLength(1);
      expect(String(rows[0][FILTER_SPELLED])).toBe(FILTER_SPELLED_MATCH);
      expect(Number(rows[0].amount)).toBeCloseTo(FILTER_SPELLED_MATCH_AMOUNT, 6);
    }, 180000);

    it('filters an HONEST DATE-declared formula by a range, on every storage', async () => {
      // The docs' load-bearing claim — "a formula that genuinely returns a date filters
      // correctly on all five storages" — asserted since the ruling and never executed. On
      // BigQuery and Athena it could NOT have worked before this slice: a DATE expression against
      // a STRING-bound parameter is BQ-E4 / ATH-E4.
      const rows = await readReportRows(
        storage.storageType,
        await buildFilterReport({
          columnConfig: [FILTER_HONEST_DATE, 'amount'],
          filterConfig: [
            {
              column: FILTER_HONEST_DATE,
              operator: 'between',
              value: { from: FILTER_DATE_FROM, to: FILTER_DATE_TO },
            },
          ],
        })
      );

      expect(rows.map(row => Number(row.amount)).sort((a, b) => a - b)).toEqual(
        FILTER_HONEST_DATE_AMOUNTS
      );
      // The COALESCE really is what the warehouse evaluated: neither column alone gives this set.
      expect(FILTER_HONEST_DATE_AMOUNTS).not.toEqual(FILTER_HONEST_DATE_A_ONLY_AMOUNTS);
      expect(FILTER_HONEST_DATE_AMOUNTS).not.toEqual(FILTER_HONEST_DATE_B_ONLY_AMOUNTS);
    }, 300000);

    it('imposes the DATE declaration on a MIS-declared ISO-string formula', async () => {
      const report = await buildFilterReport({
        columnConfig: [FILTER_ISO_DATE, 'amount'],
        filterConfig: [
          {
            column: FILTER_ISO_DATE,
            operator: 'between',
            value: { from: FILTER_DATE_FROM, to: FILTER_DATE_TO },
          },
        ],
      });

      // The declaration now reaches the filter's type resolver, so the four dialects with a DATE
      // placeholder cast emit one — which is what makes BigQuery and Athena refuse a comparison
      // they used to answer (as text, right by coincidence on ISO values). Redshift emits no cast
      // on either side and stays lexicographic; Snowflake and Databricks coerce and parse.
      if (storage.misdeclaredIsoDateRange === 'error') {
        await expect(readReportRows(storage.storageType, report)).rejects.toThrow();
        return;
      }
      const rows = await readReportRows(storage.storageType, report);
      expect(rows.map(row => Number(row.amount)).sort((a, b) => a - b)).toEqual(
        FILTER_ISO_DATE_AMOUNTS
      );
    }, 300000);

    it('leaves IS NULL uncast where a comparison raises on an unparseable row', async () => {
      // `is_null` is deliberately outside `COMPARISON_OPERATORS`: it looks at no value, and casting
      // its left-hand side would make ONE unparseable row fail a whole query that used to return
      // rows. This is that scope, measured.
      const nulls = await readReportRows(
        storage.storageType,
        await buildFilterReport({
          columnConfig: [FILTER_BAD, 'amount'],
          filterConfig: [{ column: FILTER_BAD, operator: 'is_null' }],
        })
      );
      expect(nulls).toHaveLength(1);
      expect(Number(nulls[0].amount)).toBeCloseTo(FILTER_BAD_NULL_AMOUNT, 6);

      const notNulls = await readReportRows(
        storage.storageType,
        await buildFilterReport({
          columnConfig: [FILTER_BAD, 'amount'],
          filterConfig: [{ column: FILTER_BAD, operator: 'is_not_null' }],
        })
      );
      expect(notNulls).toHaveLength(FILTER_BAD_NOT_NULL_ROWS);

      // And the COST of the cast, on the same field and the same eight rows: one `'abc'` turns a
      // report that used to come back wrong into a report that does not come back.
      const comparison = await buildFilterReport({
        columnConfig: [FILTER_BAD, 'amount'],
        filterConfig: [{ column: FILTER_BAD, operator: 'gt', value: FILTER_NUM_THRESHOLD }],
      });
      if (storage.unparseableComparison === 'error') {
        await expect(readReportRows(storage.storageType, comparison)).rejects.toThrow();
      } else {
        expect(await readReportRows(storage.storageType, comparison)).toHaveLength(
          FILTER_BAD_ABOVE_THRESHOLD_ROWS
        );
      }
    }, 300000);

    it('carries the DATE declaration into a function-carrying HAVING', async () => {
      // `MIN(<DATE-declared string formula>) >= …` over the day-ambiguous `05/08/2026`, at TWO
      // thresholds, because one cannot separate the three readings: 2026-01-01 tells a real date
      // comparison from a lexicographic one (`'0' < '2'`), and 2026-06-01 then tells MDY (8 May,
      // fails) from the DMY the formula means (5 August, passes).
      const havingReport = async (threshold: string): Promise<ReportLikeReadPlan> =>
        buildFilterReport({
          columnConfig: [FILTER_GRP, FILTER_AMB_DATE],
          aggregationConfig: [{ column: FILTER_AMB_DATE, function: 'MIN' }],
          filterConfig: [
            { column: FILTER_AMB_DATE, function: 'MIN', operator: 'gte', value: threshold },
          ],
        });

      if (storage.functionDateHaving === 'error') {
        await expect(
          readReportRows(storage.storageType, await havingReport('2026-01-01'))
        ).rejects.toThrow();
        await expect(
          readReportRows(storage.storageType, await havingReport('2026-06-01'))
        ).rejects.toThrow();
        return;
      }

      const wide = await readReportRows(storage.storageType, await havingReport('2026-01-01'));
      const narrow = await readReportRows(storage.storageType, await havingReport('2026-06-01'));

      if (storage.functionDateHaving === 'lexicographic') {
        // `'05/08/2026' >= '2026-01-01'` is FALSE as text, so no group clears either threshold —
        // an empty report either way, silently.
        expect(wide).toHaveLength(0);
        expect(narrow).toHaveLength(0);
        return;
      }

      // The silent one. A real DATE comparison that reads the string as 8 MAY: every group clears
      // 2026-01-01 where none did before, and none clears 2026-06-01 although 5 August does.
      expect(wide.map(row => String(row[FILTER_GRP])).sort()).toEqual(FILTER_GROUP_KEYS);
      expect(wide.map(row => String(row[FILTER_AMB_DATE_MIN])).length).toBe(
        FILTER_GROUP_KEYS.length
      );
      expect(narrow).toHaveLength(0);
    }, 300000);

    it('resolves relative_date against a TIMESTAMP-declared formula', async () => {
      const report = await buildFilterReport({
        columnConfig: [FILTER_RECENT_TS, 'amount'],
        filterConfig: [
          {
            column: FILTER_RECENT_TS,
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: RELATIVE_DATE_WINDOW_DAYS },
          },
        ],
      });

      // BigQuery alone reads the declared type here, and a TIMESTAMP left-hand side becomes
      // `DATE((formula))` — GoogleSQL does not coerce TIMESTAMP to DATE in a comparison, so
      // without the wrap this predicate is a type error rather than a whole-day match.
      const sql = await composeReportSql(report);
      expect(`${storage.label}: ${/DATE\(\(\s*COALESCE/.test(sql)}`).toBe(
        `${storage.label}: ${storage.relativeDateWrapsDate}`
      );

      const rows = await readReportRows(storage.storageType, report);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].amount)).toBeCloseTo(FILTER_RECENT_ROW_AMOUNT, 6);
    }, 300000);
  });
}

registerSuite(bigQueryCase);
registerSuite(athenaCase);
registerSuite(redshiftCase);
registerSuite(snowflakeCase);
registerSuite(databricksCase);
