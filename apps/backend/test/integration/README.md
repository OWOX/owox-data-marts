# Real Database Integration Tests

Tests that validate cloud database adapters against real APIs. These catch SDK version issues, permission problems, SQL dialect bugs, and data type mismatches that mocks and in-memory tests cannot detect.

## Directory Structure

```
integration/
├── README.md                      # This file
├── setup-env.ts                   # Loads root .env.tests via dotenv (Jest setupFiles)
├── bigquery.integration.ts        # Google BigQuery: 6 tests (access, dry run, schema)
└── athena.integration.ts          # AWS Athena: 6 tests (access, dry run, schema)
```

## Running

```bash
npm run test:integration -w @owox/backend
```

- **Without credentials:** All 12 tests skip gracefully, exit code 0
- **With BigQuery only:** 6 BQ pass, 6 Athena skip
- **With Athena only:** 6 BQ skip, 6 Athena pass
- **With both:** All 12 pass

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
```

### Minimum Cloud Permissions

**BigQuery service account:**
- `bigquery.tables.create` / `bigquery.tables.delete` (on dataset)
- `bigquery.jobs.create` (on project)
- `bigquery.tables.getData` / `bigquery.tables.get` (on dataset)

**AWS IAM user:**
- `athena:StartQueryExecution`, `athena:GetQueryExecution`, `athena:GetQueryResults`
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` (on output bucket)
- `glue:GetTable`, `glue:CreateTable`, `glue:DeleteTable`, `glue:GetDatabase` (on Glue catalog)

## Test Files

### `setup-env.ts`

Loaded by Jest via `setupFiles` in `jest-integration.json`. Runs before any test file. First loads root `.env` for base configuration, then loads root `.env.tests` with `override: true` so test values take priority over `.env` defaults (e.g., prevents sqlite DB_TYPE from overriding test database settings). If `.env.tests` doesn't exist, no error — env vars just won't be set and tests will skip.

### `bigquery.integration.ts` — 6 tests

**Setup (`beforeAll`, 60s timeout):**
- Parse `BQ_SERVICE_ACCOUNT_KEY` JSON into credentials
- Create `BigQueryApiAdapter` with real credentials
- Create temp table: `` CREATE TABLE `project.dataset.integration_test_<timestamp>` (...) ``
- Table has 5 columns: `id INT64`, `name STRING`, `active BOOL`, `created_at TIMESTAMP`, `amount NUMERIC`

**Teardown (`afterAll`, 30s timeout):**
- `` DROP TABLE IF EXISTS `project.dataset.integration_test_<timestamp>` ``
- Wrapped in `try/catch` — cleanup failure doesn't fail the test run

**Tests:**

| # | Group | Test | What It Validates |
|---|-------|------|-------------------|
| 1 | Access Validation | Valid credentials accepted | `adapter.checkAccess()` resolves without error |
| 2 | Access Validation | Invalid credentials rejected | Adapter with corrupted `private_key` throws |
| 3 | SQL Dry Run | Valid query passes | `executeDryRunQuery(SELECT * FROM table)` returns `totalBytesProcessed >= 0` |
| 4 | SQL Dry Run | Invalid syntax rejected | `SELEKT * FORM invalid` throws |
| 5 | SQL Dry Run | Non-existent table rejected | `SELECT * FROM nonexistent_table_xxx` throws |
| 6 | Schema Actualization | Reads real schema | `schemaProvider.getActualDataMartSchema()` returns type `bigquery-data-mart-schema`, 5 fields with correct names and non-empty type strings |

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

| # | Group | Test | What It Validates |
|---|-------|------|-------------------|
| 1 | Access Validation | Valid credentials accepted | `adapter.checkAccess(outputBucket)` resolves (runs `SELECT 1`) |
| 2 | Access Validation | Invalid credentials rejected | Adapter with fake AWS keys throws |
| 3 | SQL Dry Run | Valid query passes (EXPLAIN) | `executeDryRunQuery(SELECT * FROM table)` runs `EXPLAIN` successfully |
| 4 | SQL Dry Run | Invalid syntax rejected | `SELEKT * FORM invalid` throws |
| 5 | SQL Dry Run | Non-existent table rejected | `SELECT * FROM "db"."nonexistent_table_xxx"` throws |
| 6 | Schema Actualization | Reads real schema | `schemaProvider.getActualDataMartSchema()` returns type `athena-data-mart-schema`, 4 fields with correct names |

**Key patterns:**

- **SQL quoting differs by statement type:**
  - DDL (`DROP TABLE IF EXISTS`): Uses backticks — parsed by Hive engine
  - DML/CTAS (`CREATE TABLE ... AS SELECT`, `SELECT`, `EXPLAIN`): Uses double quotes — parsed by Trino engine
- **TIMESTAMP precision:** Must use `TIMESTAMP '2024-01-01 00:00:00.000'` (millisecond). `TIMESTAMP '2024-01-01 00:00:00'` creates `timestamp(0)` which fails with "Incorrect timestamp precision"
- **Unique table names:** `integration_test_<timestamp>_<random>` — prevents collisions in parallel runs or rapid re-runs
- **S3 prefix structure:** `integration-test/<table_suffix>/data/` for CTAS output, `integration-test/cleanup/`, `integration-test/ctas/`, `integration-test/drop/` for query outputs
- **Pre-cleanup:** Always `DROP TABLE IF EXISTS` before creating — handles leftover state from crashed/interrupted test runs
- **Manual dependency wiring:** Same as BigQuery — `AthenaApiAdapterFactory`, `S3ApiAdapterFactory`, `AthenaQueryBuilder`, `AthenaDataMartSchemaProvider` instantiated directly

## Adding a New Integration Test

1. Create `your-service.integration.ts` in this directory
2. File must match `*.integration.ts` pattern (Jest testRegex)
3. Follow credential gating pattern:

```typescript
const CREDENTIALS_AVAILABLE = !!(process.env.YOUR_API_KEY);

if (!CREDENTIALS_AVAILABLE) {
  console.log('Skipping YourService tests: YOUR_API_KEY not set');
}

const describeIfCredentials = CREDENTIALS_AVAILABLE ? describe : describe.skip;

describeIfCredentials('YourService Integration Tests', () => {
  // ... setup, tests, teardown
});
```

4. Add env vars to root `.env.tests` (for local) and `test-integration.yml` (for CI)
5. Use appropriate timeouts: `beforeAll` 120s, `afterAll` 60s, tests 30s
6. Always clean up test resources in `afterAll` (wrapped in `try/catch`)
7. Use unique names with timestamps to avoid collisions

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
