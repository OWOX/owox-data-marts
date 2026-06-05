# Real Database Integration Tests

Tests that validate cloud database adapters against real APIs. These catch SDK version issues, permission problems, SQL dialect bugs, and data type mismatches that mocks and in-memory tests cannot detect.

## Directory Structure

```text
integration/
├── README.md                                          # This file
├── setup-env.ts                                       # Loads root .env.tests via dotenv (Jest setupFiles)
├── bigquery.integration.ts                            # Google BigQuery: 6 tests (access, dry run, schema)
├── athena.integration.ts                              # AWS Athena: 6 tests (access, dry run, schema)
├── google-sheets.integration.ts                       # Google Sheets: 4 tests (metadata CRUD) - [NOT WORKING, DO NOT ENABLE ON CI]
└── google-sheets-column-preservation.integration.ts   # Google Sheets diff-based writer: 8 tests (DoD A/B/C: imported-rectangle isolation, column-order preservation, fill-down)
```

## Running

```bash
npm run test:integration -w @owox/backend
```

- **Without credentials:** All 16 tests skip gracefully, exit code 0
- **With BigQuery only:** 6 BQ pass, 10 skip
- **With Athena only:** 6 Athena pass, 10 skip
- **With Google Sheets only:** 4 GS pass, 12 skip [Warning: These tests are currently not in working condition]
- **With all credentials:** All 16 pass

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

| Secret name                        | Group         | Value / where to get it                                                                                              |
| ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BQ_SERVICE_ACCOUNT_KEY`           | BigQuery      | The **entire** GCP service-account key JSON blob (the `{ "type": "service_account", … }` file contents, not a path) |
| `BQ_PROJECT_ID`                    | BigQuery      | GCP project ID, e.g. `my-gcp-project`                                                                                |
| `BQ_DATASET`                       | BigQuery      | Existing BigQuery dataset name, e.g. `integration_tests`                                                             |
| `AWS_ACCESS_KEY_ID`                | Athena        | IAM access key id (`AKIA…`) with the Athena/S3/Glue permissions listed above                                        |
| `AWS_SECRET_ACCESS_KEY`            | Athena        | The matching IAM secret access key                                                                                  |
| `ATHENA_REGION`                    | Athena        | AWS region of the Athena workgroup, e.g. `eu-west-1`                                                                 |
| `ATHENA_OUTPUT_BUCKET`             | Athena        | S3 bucket for query results, **without** the `s3://` prefix                                                         |
| `ATHENA_DATABASE`                  | Athena        | Existing Athena database (create once via `CREATE DATABASE …`)                                                      |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | Google Sheets | Full GCP service-account key JSON, **Editor**-shared on the test spreadsheet                                       |
| `TEST_GOOGLE_SPREADSHEET_ID`       | Google Sheets | The spreadsheet ID (the long token in its URL)                                                                       |

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
