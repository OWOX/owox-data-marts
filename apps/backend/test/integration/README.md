# Real Database Integration Tests

Tests that validate cloud database adapters against real APIs. These catch SDK version issues, permission problems, SQL dialect bugs, and data type mismatches that mocks and in-memory tests cannot detect.

## Directory Structure

```text
integration/
├── README.md                                          # This file
├── setup-env.ts                                       # Loads root .env.tests via dotenv (Jest setupFiles)
├── bigquery.integration.ts                            # Google BigQuery: 6 tests (access, dry run, schema)
├── athena.integration.ts                              # AWS Athena: 6 tests (access, dry run, schema)
├── row-level-calculated-field-real.integration.ts     # Calculated Fields (#6732) — flat, joined, report-aggregated, formula-referencing-formula, date bucketing + the declared-type cast AND filters on a calculated field, on all 5 storages: 180 tests (36 per storage)
├── google-sheets.integration.ts                       # Google Sheets: 4 tests (metadata CRUD) - [NOT WORKING, DO NOT ENABLE ON CI]
└── google-sheets-column-preservation.integration.ts   # Google Sheets diff-based writer: 8 tests (DoD A/B/C: imported-rectangle isolation, column-order preservation, fill-down)
```

> [!NOTE]
> The list above documents the suites this README describes in detail; the directory holds more
> `*.integration.ts` files than are written up here (the per-storage output-controls matrices, the
> data-quality suites, `http-data-real`, `report-run-real`, `query-data-mart-real`,
> `advanced-search-mysql`). All of them follow the same credential gating and cleanup conventions.

## Running

```bash
npm run test:integration -w @owox/backend
```

Counts below are for the four suites documented in this README (16 tests) plus
`row-level-calculated-field-real` (180 tests, 36 per storage) — 196 in total.

- **Without credentials:** All 196 tests skip gracefully, exit code 0
- **With BigQuery only:** 6 BQ + 36 calculated-field pass, 154 skip
- **With Athena only:** 6 Athena + 36 calculated-field pass, 154 skip
- **With Google Sheets only:** 4 GS pass, 192 skip [Warning: These tests are currently not in working condition]
- **With all credentials:** All 196 pass — measured storage by storage on 2026-08-24, 36/36 on each
  of BigQuery, Athena, Redshift, Snowflake and Databricks. Test 24 (§6.1) was red on Snowflake
  between 2026-08-24 and the ruling that followed it; it now asserts the refusal that ruling
  produced, and reaches no warehouse at all. See the "Test 24 asserts a refusal, and why" note below.

> [!WARNING]
> **Run the Snowflake block FIRST when running blocks one at a time.** The account carries a
> `DAILY_10USD_CAP` resource monitor that has suspended the warehouse mid-session twice on this
> feature's branch. A green `data-quality-snowflake` proves nothing about it: that suite can pass
> 21/21 from the result cache with no warehouse running. Only a statement that must COMPUTE — this
> suite's seeding `CREATE` + `INSERT` under a per-run table name — shows the warehouse is up.

To run ONE storage's block, filter by its describe name — `npx jest --config ./test/jest-integration.json
row-level-calculated-field-real -t "on real BigQuery"`. Jest skips a fully filtered block's `beforeAll`,
so the other four storages are not seeded and no warehouse of theirs is touched.

## Credential Setup

Create `.env.tests` at the project root (this file is git-ignored via the `.env.*` pattern):

```bash
# === BigQuery ===
# JSON string of a GCP service account key (the entire JSON blob, not a file path)
BQ_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"...@...iam.gserviceaccount.com","token_uri":"https://oauth2.googleapis.com/token"}
# GCP project ID
BQ_PROJECT_ID=my-gcp-project
# BigQuery dataset name (must already exist in the project)
BQ_DATASET=my_dataset

# === Athena ===
# AWS IAM credentials with Athena + S3 permissions
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI...
# AWS region where Athena workgroup is configured
ATHENA_REGION=eu-west-1
# S3 bucket for Athena query results (without s3:// prefix)
ATHENA_OUTPUT_BUCKET=my-athena-results-bucket
# Athena database name (must already exist — create via: CREATE DATABASE name)
ATHENA_DATABASE=my_test_database

# === Databricks ===
# Workspace host — HOSTNAME ONLY, no https:// (passed straight to DBSQLClient.connect({ host }))
DATABRICKS_HOST=dbc-xxxxxxxx.cloud.databricks.com
# SQL warehouse HTTP path (Warehouse → Connection details → HTTP path)
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/abcdef1234567890
# Personal access token (User Settings → Developer → Access tokens)
DATABRICKS_TOKEN=dapi...
# Catalog + schema that host the seed table (the token needs CREATE/DROP TABLE there)
DATABRICKS_CATALOG=main
DATABRICKS_SCHEMA=default

# === Google Sheets ===
# JSON string of a GCP service account key with Google Sheets API access
# (Editor role on TEST_GOOGLE_SPREADSHEET_ID — sheet add/delete requires Editor).
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"...@...iam.gserviceaccount.com","token_uri":"https://oauth2.googleapis.com/token"}
# Google Spreadsheet ID for testing (must be accessible by the service account).
# The column-preservation suite creates and deletes its own tabs inside this
# spreadsheet; no pre-existing tabs are required.
TEST_GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
```

### Minimum Cloud Permissions

**BigQuery service account:**

- `bigquery.tables.create` / `bigquery.tables.delete` (on dataset)
- `bigquery.jobs.create` (on project)
- `bigquery.tables.getData` / `bigquery.tables.get` (on dataset)

**Google Sheets service account:**

- `sheets.spreadsheets.get` (read metadata)
- `sheets.spreadsheets.batchUpdate` (create/update/delete developer metadata)
- Share the test spreadsheet with the service account email

**Athena IAM user:**

- `athena:StartQueryExecution`, `athena:GetQueryExecution`, `athena:GetQueryResults`
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` (on output bucket)
- `glue:GetTable`, `glue:CreateTable`, `glue:DeleteTable`, `glue:GetDatabase` (on Glue catalog)

**Databricks token:**

- `CREATE TABLE` / `DROP TABLE` on `DATABRICKS_CATALOG`.`DATABRICKS_SCHEMA` (the suite
  seeds and drops its own table)
- `SELECT` on that schema; the SQL warehouse must be running (or auto-start enabled)

## CI Setup (GitHub Actions)

The scheduled workflow [`.github/workflows/test-integration.yml`](../../../../.github/workflows/test-integration.yml)
runs these same suites in CI. Locally the credentials come from `.env.tests`; in
CI they come from **GitHub Actions secrets**. Same variable names, different home.

### Where to put them

`Settings → Secrets and variables → Actions → Secrets` tab →
**`Repository secrets`** → green **`New repository secret`** button.

> Use the **Repository secrets** section (the one with `DOCS_GTM_ID`,
> `NODE_AUTH_TOKEN`, …), **not** "Environment secrets". The workflow does not
> declare an `environment:`, so environment-scoped secrets are never injected.

For each secret: **Name** = the exact name from the table below (case-sensitive,
must match the workflow verbatim), **Value** = the raw value (no surrounding
quotes — not even for the JSON ones).

### Secrets to add (10 total)

| Secret name                          | Group         | Value / where to get it                                                                                             |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BQ_SERVICE_ACCOUNT_KEY`             | BigQuery      | The **entire** GCP service-account key JSON blob (the `{ "type": "service_account", … }` file contents, not a path) |
| `BQ_PROJECT_ID`                      | BigQuery      | GCP project ID, e.g. `my-gcp-project`                                                                               |
| `BQ_DATASET`                         | BigQuery      | Existing BigQuery dataset name, e.g. `integration_tests`                                                            |
| `AWS_ACCESS_KEY_ID`                  | Athena        | IAM access key id (`AKIA…`) with the Athena/S3/Glue permissions listed above                                        |
| `AWS_SECRET_ACCESS_KEY`              | Athena        | The matching IAM secret access key                                                                                  |
| `ATHENA_REGION`                      | Athena        | AWS region of the Athena workgroup, e.g. `eu-west-1`                                                                |
| `ATHENA_OUTPUT_BUCKET`               | Athena        | S3 bucket for query results, **without** the `s3://` prefix                                                         |
| `ATHENA_DATABASE`                    | Athena        | Existing Athena database (create once via `CREATE DATABASE …`)                                                      |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | Google Sheets | Full GCP service-account key JSON, **Editor**-shared on the test spreadsheet                                        |
| `TEST_GOOGLE_SPREADSHEET_ID`         | Google Sheets | The spreadsheet ID (the long token in its URL)                                                                      |

Redshift (`REDSHIFT_REGION`, `REDSHIFT_WORKGROUP_NAME`, `REDSHIFT_DATABASE`) reuses the
Athena `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Databricks needs five DATABRICKS\_-prefixed
secrets: `DATABRICKS_HOST`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN`, `DATABRICKS_CATALOG`,
`DATABRICKS_SCHEMA`. As with every other suite, a job whose secrets are missing just skips
(green), so they can be added independently.

`NODE_ENV`, `TEST_GOOGLE_SHEET_ID` (`'0'`) and `TEST_GOOGLE_SHEET_ID_2` (`'1'`)
are **not** secrets — they are hard-coded in the workflow, nothing to add.

### Notes that bite people

- **JSON secrets** (`BQ_SERVICE_ACCOUNT_KEY`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`):
  paste the JSON exactly as downloaded. Do **not** wrap it in quotes and do **not**
  unescape the `\n` inside `private_key` — the test does `JSON.parse(...)` and
  expects the raw blob.
- **Partial credentials are fine.** Each suite is credential-gated: a job with
  missing secrets skips its tests and still exits 0. So you can land Athena
  secrets first and the BigQuery/Sheets jobs just skip until you add theirs.
- **Which secret feeds which matrix job:** `BigQuery` → BQ\_\*; `Athena` → AWS\_\* +
  ATHENA\_\*; `HTTP Data` → both AWS\_\* + BQ\_\*; `Report read` → AWS\_\* + ATHENA\_\*;
  `Google Sheets` → GOOGLE*SHEETS*\* + BQ\_\* (no `BQ_DATASET` needed there).
  The env block is shared across all jobs, so add everything for a fully green run.
- **Fork PRs get nothing.** GitHub does not pass secrets to workflows triggered
  from forks (the secrets page says this too). Not an issue here — this workflow
  only runs on `schedule` and manual `workflow_dispatch`, never on PRs.

### Run it / verify

- Manual: `Actions` tab → **Integration Tests (Real DB)** → **Run workflow**
  (this is the `workflow_dispatch` trigger). Pick the branch and start it.
- Scheduled: runs automatically at `0 5,13 * * *` UTC (08:00 & 16:00 Kyiv).
  A failed scheduled run opens/updates a tracking issue labeled
  `integration-failure`; manual dispatches don't (the person who clicked is
  already watching).
- Green = secrets wired correctly. A job that shows all-skipped means its
  secrets are missing or misnamed.

## Test Files

### `setup-env.ts`

Loaded by Jest via `setupFiles` in `jest-integration.json`. Runs before any test file. First loads root `.env` for base configuration, then loads root `.env.tests` with `override: true` so test values take priority over `.env` defaults (e.g., prevents sqlite DB_TYPE from overriding test database settings). If `.env.tests` doesn't exist, no error — env vars just won't be set and tests will skip.

### `bigquery.integration.ts` — 6 tests

**Setup (`beforeAll`, 60s timeout):**

- Parse `BQ_SERVICE_ACCOUNT_KEY` JSON into credentials
- Create `BigQueryApiAdapter` with real credentials
- Create temp table: ``CREATE TABLE `project.dataset.integration_test_<timestamp>` (...)``
- Table has 5 columns: `id INT64`, `name STRING`, `active BOOL`, `created_at TIMESTAMP`, `amount NUMERIC`

**Teardown (`afterAll`, 30s timeout):**

- `` DROP TABLE IF EXISTS `project.dataset.integration_test_<timestamp>` ``
- Wrapped in `try/catch` — cleanup failure doesn't fail the test run

**Tests:**

| #   | Group                | Test                         | What It Validates                                                                                                                           |
| --- | -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Access Validation    | Valid credentials accepted   | `adapter.checkAccess()` resolves without error                                                                                              |
| 2   | Access Validation    | Invalid credentials rejected | Adapter with corrupted `private_key` throws                                                                                                 |
| 3   | SQL Dry Run          | Valid query passes           | `executeDryRunQuery(SELECT * FROM table)` returns `totalBytesProcessed >= 0`                                                                |
| 4   | SQL Dry Run          | Invalid syntax rejected      | `SELEKT * FORM invalid` throws                                                                                                              |
| 5   | SQL Dry Run          | Non-existent table rejected  | `SELECT * FROM nonexistent_table_xxx` throws                                                                                                |
| 6   | Schema Actualization | Reads real schema            | `schemaProvider.getActualDataMartSchema()` returns type `bigquery-data-mart-schema`, 5 fields with correct names and non-empty type strings |

**Key patterns:**

- Identifier quoting: Backticks for all BigQuery SQL (`` `project.dataset.table` ``)
- Manual dependency wiring: `BigQueryApiAdapterFactory`, `BigQueryQueryBuilder`, `BigQueryDataMartSchemaProvider` instantiated directly (no NestJS DI)
- `{} as DataStorageCredentialsResolver` as dummy — factory `.create()` never uses the resolver in this context

### `athena.integration.ts` — 6 tests

**Setup (`beforeAll`, 120s timeout):**

- Create `AthenaApiAdapter` and `S3ApiAdapter` with real credentials
- **Pre-cleanup:** `DROP TABLE IF EXISTS` to handle leftover tables from crashed previous runs
- **CTAS table creation:** Creates a Parquet table on S3 via `CREATE TABLE ... AS SELECT`
- Table has 4 columns: `id INTEGER`, `name VARCHAR`, `active BOOLEAN`, `created_at TIMESTAMP(3)`

**Teardown (`afterAll`, 60s timeout):**

- Drop the test table via DDL
- Clean up S3 data at CTAS external location
- Clean up all S3 output files under `integration-test/` prefix (covers ctas, cleanup, drop, dry-run, schema-fetch query outputs)
- Each cleanup wrapped in individual `try/catch`

**Tests:**

| #   | Group                | Test                         | What It Validates                                                                                              |
| --- | -------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Access Validation    | Valid credentials accepted   | `adapter.checkAccess(outputBucket)` resolves (runs `SELECT 1`)                                                 |
| 2   | Access Validation    | Invalid credentials rejected | Adapter with fake AWS keys throws                                                                              |
| 3   | SQL Dry Run          | Valid query passes (EXPLAIN) | `executeDryRunQuery(SELECT * FROM table)` runs `EXPLAIN` successfully                                          |
| 4   | SQL Dry Run          | Invalid syntax rejected      | `SELEKT * FORM invalid` throws                                                                                 |
| 5   | SQL Dry Run          | Non-existent table rejected  | `SELECT * FROM "db"."nonexistent_table_xxx"` throws                                                            |
| 6   | Schema Actualization | Reads real schema            | `schemaProvider.getActualDataMartSchema()` returns type `athena-data-mart-schema`, 4 fields with correct names |

**Key patterns:**

- **SQL quoting differs by statement type:**
  - DDL (`DROP TABLE IF EXISTS`): Uses backticks — parsed by Hive engine
  - DML/CTAS (`CREATE TABLE ... AS SELECT`, `SELECT`, `EXPLAIN`): Uses double quotes — parsed by Trino engine
- **TIMESTAMP precision:** Must use `TIMESTAMP '2024-01-01 00:00:00.000'` (millisecond). `TIMESTAMP '2024-01-01 00:00:00'` creates `timestamp(0)` which fails with "Incorrect timestamp precision"
- **Unique table names:** `integration_test_<timestamp>_<random>` — prevents collisions in parallel runs or rapid re-runs
- **S3 prefix structure:** `integration-test/<table_suffix>/data/` for CTAS output, `integration-test/cleanup/`, `integration-test/ctas/`, `integration-test/drop/` for query outputs
- **Pre-cleanup:** Always `DROP TABLE IF EXISTS` before creating — handles leftover state from crashed/interrupted test runs
- **Manual dependency wiring:** Same as BigQuery — `AthenaApiAdapterFactory`, `S3ApiAdapterFactory`, `AthenaQueryBuilder`, `AthenaDataMartSchemaProvider` instantiated directly

### `row-level-calculated-field-real.integration.ts` — 180 tests (36 per storage)

Live proof of the Calculated Field slices (#6732, Slices 1, 2, 3, "a formula referencing another
formula", "date bucketing + the declared-type cast" and item 15, "filters on a Calculated Field") on
**all five warehouses** — BigQuery, Athena, Redshift, Snowflake, Databricks. Every guarantee these
slices make was previously pinned as an emitted SQL string per dialect and executed on none of them.
Tests 1-5 cover a report on ONE Data Mart; tests 6-9 cover a report that LEFT JOINs a second one;
tests 10-13 cover a report that applies an **aggregation** to the row-level field, so that it stops
being a grouping key; tests 14-17 cover a formula whose references are themselves Calculated Fields;
tests 18-24 cover **bucketing a row-level formula by date** and the **cast that imposes the declared
type** on an arithmetic aggregation; tests 25-36 cover **filtering by a Calculated Field** — the
clause it lands in, the metric sleeve it has to reach, and the TYPE the comparison runs under.

**Setup (`beforeAll`, 600s):** one shared `createTestApp()` for the whole file (calling it twice in a
worker process conflicts on the TypeORM DataSource singleton). Per storage: pre-drop, create and seed
a 5-row main table, a 4-row `orders` table, Slice 3's 8-row table, slice 3b's 9-row table AND item
15's 8-row table, then
provision storage → **seven** data marts → TABLE definition → publish → schema actualization through
the **HTTP API**,
then `POST /api/data-marts/:id/relationships` joining each main mart to `orders` on `customer_id`
(`targetAlias: 'orders'`, so the joined field is `orders__revenue`), and finally `PUT /schema` adding
the calculated fields with **no `level` on the wire**. The save's response is asserted to carry the
DERIVED levels (`column` / `metric`) and `warehouseValidation: 'passed'` — i.e. the formula really
reached that warehouse's dry run. The schema PUT is deliberately LAST, so the formula is saved on a
Data Mart that already joins another — the configuration Slice 1 refused outright.

The **fourth** mart reads the SAME five-row table as the first, through a Data Mart of its own: a
formula-referencing-formula fixture needs no data the five rows do not already hold, and a separate
mart is what keeps its five calculated fields from moving a number tests 1-9 assert.

The **fifth** mart belongs to slice 3b and reads its nine-row table with ten calculated fields. The
**sixth** is item 15's: it reads the eight-row filter table and carries nine calculated fields of its
own. The **seventh** reads slice 3b's table again but joins an EIGHTH mart over the `orders` TABLE
whose `ctr` field is a FORMULA — the quiet shape of D12, kept off the shared `orders` mart so that
nothing tests 6-17 assert can move.

**Teardown (`afterAll`, 90s):** drops all five seed tables (and, for Athena, sweeps the run's S3
prefix); wrapped in `try/catch`.

**The fixture is the proof.** Main table (`channel`, `customer_id`, `part_a`, `part_b`, `amount`,
`bonus`):

| channel | customer_id | part_a | part_b | amount | bonus | `session_key` |
| ------- | ----------- | ------ | ------ | ------ | ----- | ------------- |
| paid    | c1          | x      | yz     | 10     | 1     | `xyz`         |
| paid    | c2          | xy     | z      | 20     | 3     | `xyz`         |
| paid    | c3          | p      | q      | 30     | 2     | `pq`          |
| organic | c3          | p      | q      | 40     | 6     | `pq`          |
| organic | c4          | m      | n      | 5      | 5     | `mn`          |

`orders` (one row per customer, so the grain is the only variable): c1=100, c2=11, c3=30, c4=7 —
true total 148. It carries one more column, `ctr` (0.11 / 0.22 / 0.33 / 0.44), which no test selects:
it exists so that a SECOND Data Mart over the same table can give a FORMULA that name, which is the
one configuration where a joined calculated field returns a plausible number instead of an error.

Three properties, each load-bearing:

- Rows 1 and 2 produce the SAME formula value from DIFFERENT inputs, so grouping by the expression
  and grouping by the columns it mentions disagree (3 vs 4 rows flat, 4 vs 5 joined).
- `channel` is COARSER than the formula: 'paid' holds two `session_key` values reaching different
  customers, so a sleeve stopping at `channel` reports 141 where 111 and 30 are correct.
- customer `c3` is FINER than the join key: it spans two `channel` values, so its order is counted
  in two groups and the visible column (178) exceeds the true total (148).

**Slice 3 seeds a table of its own** (`country`, `customer_id`, `part_a`, `part_b`, `amount`),
joined to the SAME `orders` mart. Five rows cannot express what this half needs: with one row per
distinct formula value in a group, `COUNT_DISTINCT` returns `1` whether the field was correctly
aggregated or wrongly left in the grouping keys — the right answer and the signature wrong answer
coincide, and the measurement proves nothing.

| country | customer_id | part_a | part_b | amount | `session_key` |
| ------- | ----------- | ------ | ------ | ------ | ------------- |
| US      | c1          | x      | yz     | 10     | `xyz`         |
| US      | c2          | xy     | z      | 20     | `xyz`         |
| US      | c1          | p      | q      | 30     | `pq`          |
| US      | c3          | p      | q      | 40     | `pq`          |
| UK      | c3          | m      | no     | 15     | `mno`         |
| UK      | c3          | mn     | o      | 6      | `mno`         |
| UK      | c4          | r      | s      | 7      | `rs`          |
| UK      | c2          | p      | q      | 8      | `pq`          |

Four properties, each load-bearing:

- Both groups hold **4 rows** and **2 / 3** distinct `session_key`s — neither `1` (the field left in
  the GROUP BY, spec §2.1) nor the row count (a COUNT that lost its DISTINCT) nor the distinct input
  combinations (3 / 4). Every wrong reading has a different number from the right one, in both groups.
- The two groups' counts DIFFER (2 vs 3), so neither can be read off the other.
- A customer repeats WITHIN a group (c1 in US, c3 in UK), so the sleeve's de-duplication is live: US
  reads 241 instead of 141 without it. Slice 1/2's `orders` has one row per customer AND no repeated
  customer per group, so that dedup was inert there and this contrast could not be drawn.
- `pq` appears in both countries, so the report-wide distinct count (4) is neither the sum of the
  per-group counts (5) nor either of them — the numbers D11 keeps out of the Totals block.

**A formula referencing another formula seeds NO table** — it reads the five-row main table through a
fourth Data Mart, carrying five calculated fields:

| field           | formula                               | derived level               |
| --------------- | ------------------------------------- | --------------------------- |
| `revenue`       | `SUM(amount)`                         | `metric`                    |
| `cost`          | `SUM(bonus)`                          | `metric`                    |
| `roas`          | `revenue / NULLIF(cost, 0)`           | `metric` — **transitively** |
| `session_key`   | `CONCAT(part_a, part_b)` / `a \|\| b` | `column`                    |
| `session_upper` | `UPPER(session_key)`                  | `column` — **transitively** |

`roas` holds **no aggregate call in its own text**, so the non-transitive derivation classifies it a
row-level dimension and the report silently collapses to one row of valid SQL (design §2). Three
properties make that visible:

- The report is grouped by `channel`, which has **two** groups. One group's correct answer is a
  single row, indistinguishable from the collapse.
- Their ratios are **10** (60/6) and **45/11**, so neither can be read off the other.
- The collapsed value is **105/17**, equal to neither — and it is a number this report really
  publishes, as its grand TOTAL, so the wrong answer would have been plausible rather than NULL.

`session_upper` measures the same rule in the other direction: `UPPER` is scalar on all five
dialects, so nothing but the chain can make A a dimension, and a report grouped by it returns three
groups — not the four its columns give, not the five source rows, and not one.

**Slice 3b seeds a nine-row table of its own** (`customer_id`, `event_date`, `fallback_date`,
`num_prefix`, `num_suffix`, `amb_prefix`, `amb_suffix`, `big_prefix`, `big_suffix`, `amount`). None of
the three tables above can express what this half measures: it needs dates spanning three months, a
NULLable date so the formula's value differs from either column it reads, numeric-looking STRINGS
whose true sum has a fractional part, and the day-ambiguous `05/08/2026`.

| customer_id | event_date | fallback_date | `event_month` | num string | amount |
| ----------- | ---------- | ------------- | ------------- | ---------- | ------ |
| c1          | 2026-08-05 | 2026-05-14    | 2026-08       | 10.5       | 1      |
| c1          | —          | 2026-08-20    | 2026-08       | 2.25       | 3      |
| c1          | —          | 2026-05-14    | 2026-05       | 0.5        | 5      |
| c3          | 2026-05-30 | 2026-08-05    | 2026-05       | 1.25       | 7      |
| c1          | 2026-05-22 | 2026-08-05    | 2026-05       | 3.5        | 2      |
| c2          | 2026-09-02 | 2026-05-14    | 2026-09       | 0.25       | 9      |
| c4          | —          | 2026-09-27    | 2026-09       | 0.5        | 10     |
| c3          | 2026-09-15 | 2026-05-14    | 2026-09       | 1.25       | 4      |
| c2          | 2026-09-08 | 2026-05-14    | 2026-09       | 0.25       | 6      |

Four properties, each load-bearing:

- **All nine effective dates are distinct**, so the bucketed report (3 rows) and the unbucketed one
  (9) differ visibly — and both are executed, not reasoned about.
- Bucketing either RAW column instead of the formula gives different numbers everywhere: `event_date`
  publishes a NULL group and 1/9/19/18, `fallback_date` publishes 25/12/10. The correct 4/14/29
  appears in neither.
- Each bucket's distinct joined-customer count (1, 2, 3) differs from every other bucket's, from its
  own row count (2, 3, 4), from the report-wide count (4) and from the **0** a sleeve that dropped
  the truncation publishes through the counting sleeve's `COALESCE`.
- A customer repeats WITHIN a bucket (c1 in May, c2 in September), so the sleeve's de-duplication is
  live rather than inert.

Its eleven calculated fields, all row-level, and each one declared in the dialect's OWN vocabulary
(`FLOAT` / `DOUBLE` / `DOUBLE PRECISION`, `NUMERIC` / `DECIMAL` / `BIGNUMERIC`, `INTEGER` / `INT`,
`REAL`):

| field                   | formula                                   | declared as     | what it measures                       |
| ----------------------- | ----------------------------------------- | --------------- | -------------------------------------- |
| `event_month`           | `COALESCE(event_date, fallback_date)`     | `DATE`          | D16 — the bucket                       |
| `ambiguous_ts`          | `CONCAT(amb_prefix, amb_suffix)`          | `TIMESTAMP`     | §6.1 — `05/08/2026` under a time zone  |
| `num_float`             | `CONCAT(num_prefix, num_suffix)`          | float           | D19 — 20.25, not the truncated 17      |
| `num_exact_<n>`         | same                                      | each exact type | the same, per exact-decimal spelling   |
| `num_int`               | same                                      | integer         | D19b's named cost — status quo         |
| `wide_float`            | `amount * 123456789.5`                    | 32-bit float    | D19a — 5802469106.5, ten digits intact |
| `half_float`/`half_int` | `amount * 0.5`                            | float / integer | D19b — 23.5 under both, never 26 or 21 |
| `big_float`/`big_exact` | `CONCAT(big_prefix, big_suffix)` (`1e30`) | float / exact   | §3.1 — sums, then raises               |

`wide_float` is the only field here whose value a 32-bit cast target would change: `REAL` on Athena
and Redshift and `FLOAT` on Databricks are each the faithful name for a declared float and each is
32 bits wide, which is why D19a sends all three to the dialect's 64-bit type instead. Every other
number in this fixture is exact in both widths, so nothing else could tell them apart. BigQuery and
Snowflake have no 32-bit float to declare, and the same assertion measures ten digits surviving there.

**Item 15 seeds an eight-row table of its own** (`grp`, `customer_id`, `ka`, `kb`, `amount`,
`bonus`, and seven string/date/timestamp pairs), joined to the SAME `orders` mart. None of the four
tables above can express what filters measure: it needs two groups whose JOINED distinct counts move
visibly under a row-level predicate AND differ from each other, an aggregate-level measure ranked
OPPOSITE to the main one, the probe's `'9' / '10' / '100'` text, an honest DATE beside a
mis-declared ISO string, one unparseable numeric row beside a NULL one, the day-ambiguous
`05/08/2026`, and a timestamp inside a relative-date window.

| grp | customer_id | ka  | kb  | `filter_key` | amount | bonus | `num_text` | `honest_date` | `iso_date` | `bad_num` |
| --- | ----------- | --- | --- | ------------ | ------ | ----- | ---------- | ------------- | ---------- | --------- |
| g1  | c1          | p   | qr  | `pqr`        | 10     | 1     | `9`        | 2026-07-20    | 2026-07-15 | 1.5       |
| g1  | c2          | pq  | r   | `pqr`        | 20     | 2     | `10`       | 2026-08-20    | 2026-06-30 | 2.5       |
| g1  | c1          | p   | qr  | `pqr`        | 30     | 3     | `100`      | 2026-09-27    | 2026-08-05 | — (NULL)  |
| g1  | c3          | x   | yz  | `xyz`        | 40     | 4     | `2.5`      | 2026-07-02    | 2026-05-14 | 3.5       |
| g2  | c4          | p   | qr  | `pqr`        | 5      | 20    | `3.5`      | 2026-06-11    | 2026-09-02 | `abc`     |
| g2  | c4          | pq  | r   | `pqr`        | 6      | 30    | `0.5`      | 2026-09-15    | 2026-04-01 | 4.5       |
| g2  | c2          | x   | yz  | `xyz`        | 7      | 40    | `1.75`     | 2026-03-08    | 2026-07-01 | 5.5       |
| g2  | c3          | r   | s   | `rs`         | 8      | 50    | `4.25`     | 2026-08-01    | 2026-02-20 | 6.5       |

Six properties, each load-bearing:

- Rows 1/2 and 5/6 pair DIFFERENT `(ka, kb)` inputs onto the SAME `pqr`, so a predicate applied to
  the columns the formula mentions loses exactly rows 2 and 6 — amounts 20 and 6, whose presence is
  what separates the two readings.
- Under `filter_key = 'pqr'` the JOINED distinct-customer counts are **2 and 1**; unfiltered they are
  **3 and 3**. A sleeve the predicate never reached answers a CONFIDENT number here, not a NULL —
  which is why the metric is `COUNT_DISTINCT` and not `SUM`.
- A customer repeats inside BOTH filtered groups (c1 in g1, c4 in g2), so the sleeve's
  de-duplication is live: without it the revenue reads 211 / 14 instead of 111 / 7.
- `bonus` is ranked OPPOSITE to `amount` across the groups (g1 10/100, g2 140/26), so
  `bonus_total > 50` keeps **g2** while the same threshold on the report's own `SUM(amount)` keeps
  **g1**. The right answer and that mistake are different groups, not the same one.
- `'9' > '5'` is the only TRUE lexicographic comparison in `num_text`, so `> 5` is **3 rows** read as
  numbers and **exactly 1** read as text. That is the wrong subset Redshift published.
- `honest_date = COALESCE(date_a, date_b)` answers `[8, 10, 20, 40]` for the July–August range,
  where reading `date_a` alone gives `[8, 20, 40]` and `date_b` alone gives `[10]` — three different
  answers, so the COALESCE really is what the warehouse evaluated.

Its nine calculated fields — the declaration is the analyst's free choice (D3) and is deliberately a
fiction on five of them:

| field         | formula                          | declared as | what it measures                           |
| ------------- | -------------------------------- | ----------- | ------------------------------------------ |
| `filter_key`  | `CONCAT(ka, kb)` / `ka \|\| kb`  | string      | the row-level `WHERE`, outer and in-sleeve |
| `bonus_total` | `SUM(bonus)`                     | float       | the aggregate-level `HAVING` + Totals      |
| `num_text`    | `CONCAT(n_prefix, n_suffix)`     | float       | D23 `> 5`, and D25 `= 10` vs `= '10'`      |
| `spelled_num` | `CONCAT(sp_prefix, sp_suffix)`   | float       | spec §7 — `'9.0' = 9`                      |
| `bad_num`     | `CONCAT(bad_prefix, bad_suffix)` | float       | `IS NULL` uncast; the comparison's cost    |
| `honest_date` | `COALESCE(date_a, date_b)`       | `DATE`      | D24 — the honest range, on all five        |
| `iso_date`    | `CONCAT(iso_prefix, iso_suffix)` | `DATE`      | D24 — the mis-declared range               |
| `amb_date`    | `CONCAT(amb_prefix, amb_suffix)` | `DATE`      | `MIN(...) >=` over `05/08/2026`            |
| `recent_ts`   | `COALESCE(ts_a, ts_b)`           | `TIMESTAMP` | `relative_date` on a sub-day declaration   |

`recent_ts` is seeded at **midnight UTC of yesterday**, not "now": only BigQuery wraps a
relative-date left-hand side in `DATE(...)`, so on the other four the predicate compares a TIMESTAMP
against `CURRENT_DATE` — that day's midnight — and a value seeded at noon would fail `<= CURRENT_DATE`
for reasons that have nothing to do with this slice. Yesterday rather than today so a session time
zone up to a day either side of UTC (Snowflake defaults to America/Los_Angeles) cannot push the row
out of the three-day window.

**Tests:**

| #   | Spec    | Test                             | The number it asserts                                                                     |
| --- | ------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | §4.2    | Row-level field alone            | 5 rows (not 3): no implicit DISTINCT; projection is exactly `session_key`, no wildcard    |
| 2   | §2.2    | Grouped beside `SUM(amount)`     | 3 rows — `xyz`=30, `pq`=70, `mn`=5; neither 10 nor 20 (the by-input sums) appears         |
| 3   | §3.2    | Totals stays a grand total       | `amount \| SUM` = 105 (≠ 30/70/5), AVG 21, MIN 5, MAX 40; no `session_key` key            |
| 4   | §4.3    | Metric filter, kept groups       | Rows = `pq`,`xyz`; Totals `amount \| SUM` = 100 (≠ the unrestricted 105)                  |
| 5   | —       | Row-level + aggregate-level      | Per group `bonus_rate` = 4/30, 8/70, 1; Totals `bonus_rate` = 17/105                      |
| 6   | S2 §1.2 | Joined metric at formula grain   | 4 rows — revenue 111 / 30 / 30 / 7; never 141 or 37 (the channel-grain values)            |
| 7   | S2 §4   | Ungrouped joined report          | 5 rows, formula present per row: 100 / 11 / 30 / 30 / 7 beside `channel` + `session_key`  |
| 8   | S2 §4.3 | Joined Totals under a filter     | 3 kept groups; Totals `amount` 100 (≠ 105) and `orders__revenue` 141 (≠ 148)              |
| 9   | S2 §5   | Fan-out is not a defect          | Revenue column sums to 178 while Totals stays 148; the main `amount` column agrees at 105 |
| 10  | S3 §2.1 | Aggregated, plain report         | 2 rows (not 5) — `COUNT_DISTINCT` = 2 / 3, never 1; `amount` 100 / 36, never 30/70/21/7/8 |
| 11  | S3 §2.3 | Aggregated, joined + sleeve      | Same 2 / 3 beside revenue 141 / 48 — never 111/130/30/7/11, never the un-deduped 241 / 78 |
| 12  | S3 §2.3 | Aggregated, blended NO sleeve    | SQL has a `WITH` and no `sleeve_` CTE; same numbers; joined `COUNT` = each group's 4 rows |
| 13  | S3 D11  | No Totals value for the field    | Totals `amount \| SUM` = 136, AVG 17, MIN 6, MAX 40 — and no value in it is 2, 3, 4 or 5  |
| 14  | R §2    | `roas = revenue / cost`          | 2 rows — `paid` 10, `organic` 45/11; never the collapsed 105/17, which Totals carries     |
| 15  | R §2.1  | Row-level over row-level         | 3 groups (not 4, not 5, not 1) — `XYZ` 30, `PQ` 70, `MN` 5; Totals still 105, no key      |
| 16  | R D15   | A dependency is not a column     | Keys are exactly `channel`+`roas`; no `AS "revenue"` / `AS "cost"` in the SQL             |
| 17  | R §2    | The same on a BLENDED report     | Same 10 and 45/11 beside `orders__revenue` 141 / 37 and Row Count 3 / 2                   |
| 18  | 3b D16  | DATE-declared formula, MONTH     | 3 buckets — 4 / 14 / 29, never 1/9/19/18 or 25/12/10; the unbucketed twin returns 9 rows  |
| 19  | 3b D17  | The bucket inside the sleeve     | Joined `COUNT_DISTINCT` = 1 / 2 / 3 — never 0, never the row counts 2/3/4, never 4        |
| 20  | 3b D19  | Numeric strings under `SUM`      | 20.25 under the float declaration AND every exact one; never 17; plus D19a's ten digits   |
| 21  | 3b D19b | An INTEGER declaration           | 23.5 under float and integer alike, never 26 or 21; over TEXT, the per-dialect status quo |
| 22  | 3b §3.1 | The exact-decimal trade          | `1e30` sums under float and RAISES under the exact declaration                            |
| 23  | 3b D12  | Joined formula, quiet shape      | Refused — the joined table really carries `ctr`, so the SQL would have been valid         |
| 24  | 3b §6.1 | `05/08/2026` under a time zone   | Refused before any SQL — and the same bucket without the zone still saves                 |
| 25  | 15 §2   | Row-level filter, PLAIN report   | 5 of 8 rows — amounts 5/6/10/20/30; 40/7/8 gone, and 20 and 6 (expression-only) present   |
| 26  | 15 §4   | Blended, filtered field SELECTED | Joined `COUNT_DISTINCT` 2 / 1 and revenue 111 / 7 — never the unfiltered 3 / 3, 141 / 48  |
| 27  | 15 §4   | The same, field NOT selected     | Same 2 / 1; the unfiltered twin EXECUTED at 3 / 3; Totals 71 (≠ 126) and 118 (≠ 148)      |
| 28  | 15 §3   | Aggregate-level filter, HAVING   | 1 row `g2` — `bonus_total` 140, `amount` 26; Totals 26 / 140, never the whole 126 / 150   |
| 29  | 15 D23  | FLOAT-declared TEXT, `> 5`       | **`9`, `10`, `100`** — 3 rows where the lexicographic reading returns the single `9`      |
| 30  | 15 D25  | `= 10` against `= '10'`          | Both 1 row `10`, amount 20 — the pair that flipped BigQuery/Athena error ⇄ right answer   |
| 31  | 15 §7   | `'9.0' = 9`                      | 1 row, `9.0`, amount 10 — TRUE numerically, FALSE as text                                 |
| 32  | 15 D24  | HONEST DATE range, all five      | Amounts `[8, 10, 20, 40]` — not `date_a`'s `[8, 20, 40]`, not `date_b`'s `[10]`           |
| 33  | 15 D24  | MIS-declared ISO DATE range      | BigQuery/Athena RAISE; Redshift/Snowflake/Databricks answer `[7, 10, 30]`                 |
| 34  | 15 D23  | `IS NULL` beside a comparison    | `is_null` 1 row (30) and `is_not_null` 7, both fine; the `> 5` comparison raises on five  |
| 35  | 15 D24  | `MIN(<date formula>) >=`         | BQ/Athena/Databricks RAISE; Redshift 0 groups both ways; **Snowflake 2 then 0** — MDY     |
| 36  | 15 D24  | `relative_date` on a TIMESTAMP   | 1 row (amount 10); the LHS is `DATE((formula))` on BigQuery and bare on the other four    |

**Test 27, not test 26, is the one the metric sleeve's own predicate decides — measured by
mutation.** With the filtered field SELECTED it is a grouping key, so it is part of the SLEEVE's
grain as well: the outer query joins the sleeve back on `(grp, filter_key)` and only the `pqr`
tuples survive the outer `WHERE`. Emptying `renderSleeveWhere` entirely does not move a number in
test 26. In test 27 the same mutation makes `g1` read **3** where **2** is correct — the unfiltered
count, a confident number and not a NULL, which is #6766's C1 reproduced. Falsified live on BigQuery
and Redshift.

**What tests 33-35 measure, and why the expectation is per dialect.** The declared type now reaches
the filter's type resolver, so the four dialects with a DATE placeholder cast emit one — which is
what makes BigQuery and Athena REFUSE a comparison they used to answer as text (right, by
coincidence, on ISO values). Redshift emits no cast on either side of a date comparison and stays
lexicographic; on ISO strings that is the right answer for the wrong reason, and on anything else it
is an empty report, silently. Snowflake's cast makes the comparison a real DATE one and reads
`05/08/2026` as **8 May** — test 35 pins that with TWO thresholds, because one cannot separate the
three readings: `2026-01-01` tells a date comparison from a lexicographic one (`'0' < '2'`), and
`2026-06-01` then tells MDY (fails) from the DMY the formula means (would pass). This is D24's
accepted risk, executed rather than described.

**Test 34's comparison raises on all five, and that is the cost of D23.** The cast is scoped to
comparison operators precisely so `IS NULL` does not carry it — casting there would make ONE
unparseable row fail a whole query that used to return rows. Measured: `is_null` and `is_not_null`
answer correctly on every storage, and `> 5` over the same field raises on BigQuery, Athena,
Redshift, Snowflake and Databricks alike. An analyst whose FLOAT-declared formula returns one
non-numeric row goes from a wrong report to no report; the per-dialect `unparseableComparison` field
is where a dialect that answered NULL instead would be recorded.

**Key patterns:**

- **Per-dialect formula, deliberately.** Redshift's row-level field is `part_a || part_b`; the other
  four use `CONCAT(part_a, part_b)`. Executing the dialect difference is the point of the suite.
- **Declared types are copied from an actualized field** rather than hard-coded, so the same body
  works across five field-type vocabularies (`FLOAT` vs `DOUBLE`, `STRING` vs `VARCHAR`).
- **Snowflake needs quoted lowercase columns** (`"part_a"`), as elsewhere in this directory.
- **Totals reads exactly one DATA row, on every storage.** `ReportTotalsService.computeTotals` reads
  with `maxDataRows = 1`; Athena's `MaxResults` counts the header row it returns on the first page,
  so the Athena reader asks the API for one more than the caller's budget. Until it did, Totals was
  silently `null` on Athena for **every** report — a defect this suite's first live run found. The
  suite reads totals through a helper mirroring the service at that same batch size, and test 3
  cross-checks the real service on top.
- **The kept-groups join parenthesises the expression it interpolates.** `renderNullSafeJoinOn`
  builds `(<left>) = (<right>)`; bare, Redshift — which binds `=` tighter than `||` — read the `||`
  formula as `"part_a" || ("part_b" = …)` and rejected the Totals join with
  `operator does not exist: character varying || boolean`, another defect this suite's first live
  run found. Test 4 measures its numbers through the `||` field itself on Redshift, so the guarantee
  is executed rather than asserted.
- **The joined half measures a WRONG NUMBER, not an error message.** Slice 2's failure mode is a
  plausible value, so test 6 asserts each group's revenue AND that it differs from the coarse
  channel-grain one. Falsified live: dropping the row-level names from the sleeve grain
  (`metric-sleeve.builder.ts`) fires the count assertion loudly; neutering that assertion as well —
  the naive implementation of spec §1.2 — lets **141 through where 111 is correct**, with no NULL
  and no warehouse error. Test 8 passes under that same mutation (Totals is dimensionless, so its
  numbers do not depend on the report's sleeve grain), which is why test 6 has to exist separately.
- **Test 9 pins CORRECT behaviour, not a bug.** The joined column exceeding its own Totals looks
  like a defect and is not (spec §5). Falsified by making the Totals plan inherit the report's grain
  — the "reconciliation" a future reader would reach for: Totals then publishes one group's 7 as the
  grand total instead of 148, and this test is what says so.
- **Slice 3's wrong answer is a CONSTANT, and the fixture is the only thing that exposes it.**
  Falsified live: with `groupByParts.push(expression)` restored in `renderAggregatedSelect`'s
  aggregated branch — spec §2.1's SQL exactly — BigQuery returned **5 rows, `session_key |
COUNTUNIQUE` = 1 on every one**, amounts 30/70/21/7/8, no NULL and no error. Tests 10 and 12 both
  failed on the row count. On the 5-row Slice 1/2 table that same mutation would have been
  indistinguishable from a correct answer in three of four groups.
- **The no-sleeve blended report is guarded, but not against a wrong NUMBER.** Falsified in two
  steps. Reverting the sleeve plan list to a level filter fires
  `MetricSleeveBuilder.buildAll`'s grain guard on BOTH blended tests (11 and 12) — the first time
  that guard has executed on a real query. Removing the guard as well (M2b) makes test 11 fail on the
  caller's own count assertion (`metric sleeve 'sleeve_orders__revenue' groups by 2 dimension(s) but
the outer query groups by 1`), while **test 12 passes with correct numbers**: with no sleeve,
  nothing consumes `calculatedDimensions`, so that site's mistake cannot reach the SQL. The guard
  catches a latent inconsistency early; what protects the no-sleeve path from a wrong number is the
  renderer, and test 12 catches that independently (see the bullet above).
- **D11 fails on a number, not on a missing key.** Falsified by deleting
  `deriveTotalsAggregations`' `isRowLevelCalculatedField` skip — the "oversight" a later refactor
  would remove. Totals did not merely gain an entry: the block came back as
  `{"amount | SUM": 21, "AVG": 10.5, "MIN": 6, "MAX": 15, "session_key": "mno"}` — the Totals query
  grouped by the formula and `computeTotals` published `dataRows[0]`, one arbitrary group, as the
  report-wide total. Which group is not stable (an earlier run of the same mutation published 7).
  Test 13 fails on `amount | SUM` being 21 instead of 136.
- **What protects `roas` is the COMPOSE seat, not the saved level — measured, in three steps, on
  BigQuery only** (the dev project; no other storage was mutated against).
  1. Restoring `formula-analyzer.ts`'s non-transitive derivation
     (`aggregates.length > 0 ? 'metric' : 'column'`) ALONE persists `roas` as `'column'` — read back
     off the save response — and **every executed test still passes with the correct numbers**,
     because `calculatedFieldLevelOf` re-derives the level transitively at compose time. The
     persisted level really is a cache (D13), and it is not what stands between the analyst and the
     collapse.
  2. Restoring BOTH that and the compose seat's dependency walk never reaches a query at all: the
     warehouse **refuses the save**, `FORMULA_WAREHOUSE_REJECTED` attributed to **`revenue`** —

     ```text
     Aggregate function SUM not allowed in GROUP BY at [9:4]
     ```

     The dry run composes the mart's formulas as ONE metrics-only query, so a wrongly-row-level
     `roas` becomes a grouping key beside the aggregates it is built from. Design §2's "A saves
     clean" does not hold for this shape on a configured warehouse — but the message names the
     wrong field and no level at all.

  3. The reachable shape is design §3.3's: a level written by a path that skips the validator. With
     `roas` persisted as `'column'` and the walk removed, BigQuery got a SELECT with **no GROUP BY**
     — `SELECT channel, (SUM(amount)) / NULLIF((SUM(bonus)), 0) AS roas FROM … AS src` — and
     answered

     ```text
     SELECT list expression references column channel which is neither grouped nor aggregated at [2:3]
     ```

     Test 14 fails there, and test 17 fails with the blended spelling of the same
     (`main.channel … at [39:9]`); tests 15 and 16 pass, correctly — neither is a level test.

- **The shape where the right and the wrong answer are the SAME row, measured rather than argued.**
  Under that same mutation a report selecting `roas` ALONE composes byte-identical SQL to the correct
  one and returns the same single row, `{"roas": 6.176470588235294}` — no error, no log line, no
  NULL. That is design §2's first table row, and it is why the headline test groups by an ordinary
  column instead: over two channels the correct answer is 10 and 45/11, and the collapsed 105/17 is
  neither of them.

- **The bucket tests ask the VALIDATOR as well as the warehouse.** What slice 3b lifted is a
  save-time refusal (`CALCULATED_FIELD_AS_DIMENSION`), and no returned row can show that it is gone,
  so tests 18 and 19 call `OutputControlsValidatorService.validateForReport` against the same real,
  actualized Data Mart and assert it returns no codes at all.

- **A bucket value is compared as a SET of two readings.** Two of the five drivers hand a bare
  `2026-08-01` back as a JS `Date`, and nothing in that value says which zone its midnight was meant
  in — so `monthKeysOf` accepts either the UTC or the local month. The two can only ever differ by
  one day; the wrong answer every one of these tests guards against is a different MONTH.

- **The declared types are STATED, not copied from an actualized field.** Everywhere else in this
  suite a calculated field copies a real column's type, because the type is incidental there. In
  slice 3b it is the measurement: each storage case names its own float, exact-decimal and integer
  spellings, and Redshift and BigQuery name TWO exact ones because they resolve to different cast
  targets (`DECIMAL(38,18)` vs `NUMERIC(38,18)`, `NUMERIC` vs `BIGNUMERIC`).

- **Test 21 is what proves an integer declaration emits no cast at all (D19b).** `amount * 0.5` sums
  to 23.5; a per-row cast would make it 26 on the four rounding dialects and 21 on Spark, so the same
  report would total differently per warehouse. Both wrong answers are asserted against by value.

- **`integerOverTextSum` is a per-dialect EXPECTATION, and it is the slice's one named cost.** Over
  text, an integer declaration keeps doing exactly what it did before: BigQuery and Athena raise,
  Redshift returns the truncated 17, Snowflake and Databricks return the true 20.25 — while the same
  field declared FLOAT returns 20.25 everywhere.

- **The D12 refusal is measured in its QUIET shape.** The joined `orders` TABLE really carries a
  `ctr` column, and a second Data Mart over that table declares a FORMULA of the same name, so the
  SQL a missing refusal composes is valid and serves 0.11 / 0.22 / 0.33 / 0.44 where the formula
  means 200 / 22 / 60 / 14. Both seats are asserted: the compose path refuses a bare projection, and
  `validateForReport` answers `JOINED_CALCULATED_FIELD_UNSUPPORTED` on the aggregation surface.

- **Test 24 asserts a refusal, and why.** It used to ask the five warehouses what they made of a
  `05/08/2026` bucketed under a time zone, and log the answer (`[#6732 §6.1] <storage>: …`). Four of
  them refused it on 2026-08-21: BigQuery `No matching signature for function DATE`, Athena
  `TYPE_MISMATCH … (actual varchar)`, Redshift
  `function convert_timezone("unknown", text) does not exist`, Databricks
  `CAST_INVALID_INPUT … '05/08/2026' … cannot be cast to "TIMESTAMP"`. Snowflake was credit-capped
  that day (`Warehouse 'COMPUTE_WH' cannot be resumed because resource monitor 'DAILY_10USD_CAP' has
exceeded its quota`), and it was the one that mattered.

  **Measured on Snowflake 2026-08-24, and it was the wrong month.** The report returned ONE row,
  bucketed at `2026-05-01T04:00:00Z` — midnight the 1st of May in `America/New_York` — where the
  formula's `05/08/2026` means the 5th of August. No error, no NULL, one plausible bucket.
  `DATE_TRUNC('MONTH', CONVERT_TIMEZONE('America/New_York', CONCAT("amb_prefix", "amb_suffix")))`
  reads the string MDY, which is exactly the signature Redshift showed under the CAST at probe shape
  7f — and as with Redshift's `DateStyle`, Snowflake's `TIMESTAMP_INPUT_FORMAT` defaults to `AUTO`,
  so the month was a property of the session rather than of the data.

  The run proved it computed rather than replaying a cached answer: `beforeAll` created and
  `INSERT`ed the nine-row table seconds earlier under a per-run name (`rlcf_<epoch>_<rand>_bkt`), so
  no result cache could serve the query, and the schema PUT's `warehouseValidation: 'passed'` means
  the formula's dry run reached Snowflake too. Nothing in the run mentioned `DAILY_10USD_CAP`.
  A green `data-quality-snowflake` is NOT this evidence — that suite can pass 21/21 off Snowflake's
  result cache with no warehouse running at all.

  **The product owner then ruled the time-zone leg refused on a bucketed Calculated Field, on all
  five storages** — uniform behaviour and one sentence in the docs rather than a per-dialect rule,
  which is the option §6.1 pre-registered. Test 24 was rewritten to assert that refusal: the shape
  is rejected by `validateForReport` on the save surface and again by `resolveBlendingDecision` on
  the run path, before any SQL is composed, so it reaches no warehouse and there is nothing left to
  measure. It also asserts the SCOPE — the same MONTH bucket on the same formula, without a zone,
  still saves clean. The measured `2026-05-01T04:00:00Z` stays written into the test's comment
  because the rule exists for it; the refusal is not caution. A CAST is not an alternative: §1.2
  measured one producing the same wrong date on Redshift.

- **Falsified live, by mutating real source and re-running.** Every mutation was reverted afterwards.
  1. **The cast dropped** (`sql-clause-renderer.ts`, `renderAggregateArgument`), on BigQuery and
     Redshift: **Redshift published `17` where `20.25` is correct** — no error, no NULL, this
     feature's signature failure reproduced on demand — while BigQuery refused the query outright
     (`No matching signature for aggregate function SUM / Argument types: STRING`), which is the
     "starts working" half of §3 measured from the other side. Test 22 went red on both, and on
     Redshift for a second reason worth carrying: uncast, `1e30` coerces to `NUMERIC(18,0)` and
     answers `Overflow for NUMERIC(18,0)`, so the float cast is also what makes a large value
     representable there.
  2. **The sleeve's truncation dropped** (`metric-sleeve.builder.ts`, `renderDimensionExpr`), on
     BigQuery: no SQL reached the warehouse at all. The membership assertion fired first, printing
     both derivations side by side — `would join back on 'COALESCE(main.event_date, main.fallback_date)', which is not one of the outer GROUP BY keys [DATE_TRUNC(COALESCE(main.event_date, main.fallback_date), MONTH)]`.
     Only test 19 went red; test 18 stayed green, correctly, because a plain report carries no sleeve.
  3. **The same, with the membership assertion ALSO neutered** (`abstract-blended-query-builder.ts`,
     the `outerGroupByKeys.has(d.outer)` throw): BigQuery answered **`1` for May, where 2 is
     correct** — not the COALESCEd 0 the builder's own comment predicts, because the join-back runs
     per ROW before the outer GROUP BY and still matches each row against its own sleeve row, so
     `ANY_VALUE` hands every bucket a count computed at the RAW-DATE grain. A plausible number
     either way, and never a NULL.
  4. **The D12 refusal removed** (`blended-report-data.service.ts`, the
     `assertNoJoinedCalculatedColumns` call), on BigQuery: the report **succeeded**, returning nine
     rows of `{"customer_id": "c1", "orders__ctr": 0.11}` and friends — the joined table's physical
     column, where the formula means 200 / 22 / 60 / 14. Valid SQL, no warehouse error, and a
     plausible per-customer rate.

### `google-sheets.integration.ts` — 4 tests

> [!WARNING]
> These tests are currently not in working condition and should not be enabled on CI. They require additional setup and configuration.

**Setup (`beforeAll`, 60s timeout):**

- Create Google Sheets destination via API with service account credentials
- Store destination ID for use in report creation

**Teardown (`afterAll`, 60s timeout):**

- Fetch all `OWOX_REPORT_META` developer metadata from the test spreadsheet
- Delete each metadata entry via `batchUpdate` API
- Wrapped in `try/catch` — cleanup failure doesn't fail the test run

**Tests:**

| #   | Test                                        | What It Validates                                                                              |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Create developer metadata on report run     | Running a report creates `OWOX_REPORT_META` with correct `reportId`, `dataMartId`, `projectId` |
| 2   | Update metadata on re-run                   | Re-running the same report maintains metadata integrity                                        |
| 3   | Handle multiple reports on different sheets | Multiple reports on different sheets create separate metadata entries with correct sheet IDs   |
| 4   | Delete metadata when report is deleted      | Deleting a report removes its corresponding developer metadata from Google Sheets              |

**Key patterns:**

- **Async processing wait:** Tests include `setTimeout(5000)` to allow async report execution to complete
- **Metadata structure:** `OWOX_REPORT_META` contains JSON with `reportId`, `dataMartId`, `projectId`
- **Sheet-specific metadata:** Each sheet has its own metadata entry identified by `location.sheetId`
- **Automatic cleanup:** `afterAll` removes all test metadata to avoid accumulation
- **Graceful skip:** If credentials not configured, entire suite skips with console message

### `google-sheets-column-preservation.integration.ts` — 8 tests

Validates the diff-based Google Sheets writer (DoD A/B/C of the
column-preservation feature). Each test provisions an ephemeral sheet inside
the shared test spreadsheet, a fresh BigQuery-backed data mart, and a Google
Sheets report; cleanup deletes the sheet in `afterEach`.

**Required env vars:**

- `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`, `TEST_GOOGLE_SPREADSHEET_ID` — Sheets
  destination; service account must have **Editor** access on the spreadsheet
  (sheet add/delete needs Editor).
- `BQ_SERVICE_ACCOUNT_KEY`, `BQ_PROJECT_ID` — backend storage for the data
  mart. Tests use `SELECT … UNION ALL` literals, so no warehouse table is read
  and `BQ_DATASET` is **not** required for this suite.

**Setup (`beforeAll`, 60s):** boots an in-process NestJS test app via
`createTestApp()` from `@owox/test-utils`. Each `beforeEach` (per-test) calls
`createTestSheet`, `seedDataMartWithSql`, and `setupGoogleSheetsReport` from
the same package.

**Async wait policy:** `waitForReportCompletion()` polls
`GET /api/reports/:id` and returns once `runsCount` increments and
`lastRunStatus !== 'RUNNING'` (with backoff and a 45-second budget). Replaces
the legacy `setTimeout(5000)` pattern.

**Tests:**

| #   | Group          | Test                                    | What It Validates                                                                                                                                  |
| --- | -------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | First run      | Writes columns in SQL order             | Row 1 = SQL order; `OWOX_COLUMNS` metadata persisted as `[{name, alias?}, …]`                                                                      |
| 2   | DoD A          | User content right of imported survives | `K1='ratio'` and `K2='=B2/C2'` stay in place (formula via `valueRenderOption: 'FORMULA'`); imported header row unchanged                           |
| 3   | DoD B          | User-driven row-1 reorder wins          | `moveDimension` swap survives a refresh; data rows re-aligned with new header order; `OWOX_COLUMNS` reflects user order                            |
| 4   | DoD B          | New SQL column appended at right edge   | Adding `conversion_rate` to a v2 data mart bound to the same sheet: column lands at the right edge; user marker shifted right by `insertDimension` |
| 5   | DoD B          | Removed SQL column → `#REF!`            | Dropping `clicks` from SQL deletes the column; user formula referencing it surfaces `#REF!` (verified via FORMULA + EFFECTIVE value)               |
| 6   | DoD B (alias)  | Output Schema alias propagates          | Setting `country` → `'Country'` updates row 1 and `OWOX_COLUMNS` without structural ops; clearing alias restores `'country'`                       |
| 7   | DoD C          | Auto fill-down replicates row-2 formula | `K2='=B2/C2'` is replicated to `K3='=B3/C3'` and `K4='=B4/C4'` (Sheets `copyPaste` with `pasteType: 'PASTE_FORMULA'`)                              |
| 8   | Report Columns | `columnConfig` filters the export       | `columnConfig: ['country', 'cost']` → only those two columns in row 1 and `OWOX_COLUMNS`                                                           |

**Key patterns:**

- **Per-test ephemeral sheets:** `createTestSheet` issues an `addSheet`
  request with title `it-<timestamp>-<rand>-<slug>`; `afterEach` calls
  `cleanup()` which sends a `deleteSheet` (idempotent, errors swallowed with
  warn log).
- **Fresh data mart per test:** once a data mart is published its SQL is
  immutable, so tests that need a different SQL provision a brand-new data
  mart via `seedDataMartWithSql`. Cheap: no warehouse tables created.
- **Multiple reports on the same sheet (tests 4 and 5):** the writer reads
  the existing `OWOX_COLUMNS` from the prior run and diffs against the new
  schema, regardless of which `reportId` produced it.

## Adding a New Integration Test

1. Create `your-service.integration.ts` in this directory
2. File must match `*.integration.ts` pattern (Jest testRegex)
3. Follow credential gating pattern:

```typescript
const CREDENTIALS_AVAILABLE = !!process.env.YOUR_API_KEY;

if (!CREDENTIALS_AVAILABLE) {
  console.log('Skipping YourService tests: YOUR_API_KEY not set');
}

const describeIfCredentials = CREDENTIALS_AVAILABLE ? describe : describe.skip;

describeIfCredentials('YourService Integration Tests', () => {
  // ... setup, tests, teardown
});
```

1. Add env vars to root `.env.tests` (for local) and `test-integration.yml` (for CI)
2. Use appropriate timeouts: `beforeAll` 120s, `afterAll` 60s, tests 30s
3. Always clean up test resources in `afterAll` (wrapped in `try/catch`)
4. Use unique names with timestamps to avoid collisions

## Troubleshooting

**All tests skip:**
Check that `.env.tests` exists at the project root and has correct values.

**"Database X not found" (Athena):**
The Athena database must be created beforehand. Run in Athena console:

```sql
CREATE DATABASE your_database_name;
```

**"Incorrect timestamp precision" (Athena):**
Use millisecond precision: `TIMESTAMP '2024-01-01 00:00:00.000'` (3 decimal places).

**"backquoted identifiers are not supported" (Athena DML):**
Use double quotes for SELECT/EXPLAIN/CTAS: `"database"."table"`. Backticks are only for DDL (DROP TABLE).

**"mismatched input expecting BACKQUOTED_IDENTIFIER" (Athena DDL):**
Use backticks for DROP TABLE: `` `database`.`table` ``. Double quotes are only for DML.

**Leftover test tables:**
If a test run crashes mid-execution, tables may remain. The pre-cleanup in `beforeAll` handles this on the next run. To manually clean up, run `DROP TABLE IF EXISTS ...` in the respective console.

**Google Sheets "Spreadsheet not found":**
Ensure the spreadsheet ID is correct and the service account has been granted access to the spreadsheet (share it with the service account email).

**Google Sheets "Insufficient permissions":**
Verify the service account has the `https://www.googleapis.com/auth/spreadsheets` scope and the Sheets API is enabled in the GCP project.

**Google Sheets metadata not appearing:**
The report run is async. Increase the `setTimeout` wait time if tests fail due to timing issues. Check backend logs for report execution errors.
