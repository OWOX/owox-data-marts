# Testing Guide

This project uses a three-level testing strategy. Each level catches different categories of bugs and runs independently with its own CI pipeline.

| Level       | What                                        | Framework        | Command                                     | CI Trigger       |
| ----------- | ------------------------------------------- | ---------------- | ------------------------------------------- | ---------------- |
| Unit        | Functions, components, services             | Jest / Vitest    | `npm test`                                  | Every PR         |
| API E2E     | HTTP endpoints against real NestJS + SQLite | Jest + Supertest | `npm run test:e2e -w @owox/backend`         | Manual dispatch  |
| Browser E2E | Full-stack UI flows in Chromium             | Playwright       | `cd apps/web && npx playwright test`        | Manual dispatch  |
| Integration | Real cloud databases (BigQuery, Athena)     | Jest             | `npm run test:integration -w @owox/backend` | Nightly + manual |

---

## Quick Start

```bash
# Unit tests (all workspaces)
npm test

# Backend API E2E tests (SQLite in-memory)
npm run test:e2e -w @owox/backend

# Browser E2E tests (starts backend + frontend automatically)
cd apps/web && npx playwright test

# Real database integration tests (requires credentials)
npm run test:integration -w @owox/backend
```

---

## Level 1: Unit Tests

### Backend (Jest)

Tests are co-located with source files: `src/module/service.spec.ts` next to `service.ts`.

```bash
npm test -w @owox/backend          # run all
npm run test:watch -w @owox/backend # watch mode
npm run test:cov -w @owox/backend   # with coverage
```

**Config:** Inline in `apps/backend/package.json` (`jest` section)

- Test regex: `.*\.spec\.ts$`
- Environment: `node`

### Frontend (Vitest)

Tests are co-located with source: `src/components/Component.test.tsx` next to `Component.tsx`.
Hook tests go in `__tests__/` subdirectory: `src/hooks/__tests__/useHook.test.ts`.

```bash
npm test -w @owox/web               # run all
npm run test:coverage -w @owox/web   # with coverage
```

**Config:** `apps/web/vitest.config.ts`

- Environment: `happy-dom`
- Globals: `true` (no need to import `describe`, `it`, `expect`)
- Setup file loads `@testing-library/jest-dom` matchers

---

## Level 2: API E2E Tests

Full NestJS application bootstrapped with SQLite `:memory:` database. Real HTTP requests via Supertest. Real migrations, real validation pipes, real exception filters.

### Running

```bash
npm run test:e2e -w @owox/backend
```

No external dependencies required. Works offline.

### E2E Architecture

```text
packages/test-utils/
  src/
    constants.ts                          # AUTH_HEADER, NONEXISTENT_UUID, connector list
    helpers/
      create-test-app.ts                  # Bootstraps NestJS app with SQLite :memory:
      setup-published-data-mart.ts        # Creates storage + data mart + publishes
      setup-connector-data-mart.ts        # Creates storage + connector-type data mart
      setup-report-prerequisites.ts       # Creates storage + data mart + destination
      truncate-all-tables.ts              # Wipes all rows for inter-test isolation
    fixtures/
      storage.builder.ts                  # Fluent builder for DataStorage payloads
      data-mart.builder.ts                # Fluent builder for DataMart payloads
      data-destination.builder.ts         # Fluent builder for DataDestination payloads
      report.builder.ts                   # Fluent builder for Report payloads
      scheduled-trigger.builder.ts        # Fluent builder for ScheduledTrigger payloads

apps/backend/test/
  jest-e2e.json                           # Jest config for E2E tests
  jest-e2e-resolver.js                    # Resolves .js imports to .ts (ESM compat)
  smoke.e2e-spec.ts                       # Basic boot + PRAGMA check
  data-storage.e2e-spec.ts               # DataStorage CRUD + validation
  data-mart.e2e-spec.ts                  # DataMart CRUD + publish lifecycle
  data-mart-extended.e2e-spec.ts         # DataMart definition, publish, unpublish
  data-mart-runs.e2e-spec.ts             # DataMart run history
  data-destination.e2e-spec.ts           # DataDestination CRUD
  report.e2e-spec.ts                     # Report CRUD
  scheduled-trigger.e2e-spec.ts          # ScheduledTrigger CRUD
  error-handling.e2e-spec.ts             # Global error handling + edge cases
  validation-schema.e2e-spec.ts          # Payload validation rules
  connector-list.e2e-spec.ts             # Connector listing endpoints
  connector-fields.e2e-spec.ts           # Connector field metadata
  connector-specification.e2e-spec.ts    # Connector specification endpoints
  connector-oauth.e2e-spec.ts            # Connector OAuth flow
```

### Test App (`createTestApp`)

Creates a production-equivalent NestJS app with:

- SQLite `:memory:` database (no file system, no cleanup)
- Real migrations applied via `dataSource.runMigrations()`
- `PRAGMA foreign_keys = ON` for referential integrity
- `NullIdpProvider` for auth (accepts any `x-owox-authorization` header)
- Global pipes and exception filters matching production `main.ts`

```typescript
import { createTestApp, closeTestApp } from '@owox/test-utils';

let app, agent;

beforeAll(async () => {
  const testApp = await createTestApp();
  app = testApp.app;
  agent = testApp.agent;
});

afterAll(async () => {
  await closeTestApp(app);
});
```

### Authentication

Every request must include the auth header. Import the shared constant from `@owox/test-utils`:

```typescript
import { AUTH_HEADER } from '@owox/test-utils';

await agent.get('/api/data-storages').set(AUTH_HEADER);
```

`NullIdpProvider` accepts any token value. Without this header, requests return 401.

### Fixture Builders

Use builders to create test data payloads with sensible defaults:

```typescript
import { StorageBuilder, DataMartBuilder } from '@owox/test-utils';

// Create a storage
const storagePayload = new StorageBuilder().withType('GOOGLE_BIGQUERY').build();

const storageRes = await agent.post('/api/data-storages').set(AUTH_HEADER).send(storagePayload);

// Create a data mart (requires storageId from above)
const dataMartPayload = new DataMartBuilder()
  .withTitle('My Test DataMart')
  .withStorageId(storageRes.body.id)
  .build();

const dmRes = await agent.post('/api/data-marts').set(AUTH_HEADER).send(dataMartPayload);
```

### CI Workflow

**File:** `.github/workflows/e2e-api.yml`

- **Trigger:** `workflow_dispatch` (manual)
- **Timeout:** 15 minutes
- **Command:** `npm run test:e2e -w @owox/backend`

---

## Level 3: Browser E2E Tests (Playwright)

Playwright drives a real Chromium browser against the full running stack (backend + Vite frontend).

### Running Browser Tests

```bash
# First time: install browser
cd apps/web && npx playwright install chromium

# Run tests
cd apps/web && npx playwright test

# Run with UI mode (visual debugging)
cd apps/web && npx playwright test --ui

# View last report
cd apps/web && npx playwright show-report
```

Playwright auto-starts both servers:

1. **Backend:** `node dist/src/main.js` on port 3000 (must be built first: `npm run build -w @owox/backend`)
2. **Frontend:** Vite dev server on `https://localhost:5173`

Playwright always starts its own servers (`reuseExistingServer: false`). If ports 3000 or 5173 are already in use, startup fails immediately with a clear error — this prevents tests from accidentally running against a dev server with the wrong environment.

### Configuration

**File:** `apps/web/playwright.config.ts`

| Setting             | Value                    | Why                                       |
| ------------------- | ------------------------ | ----------------------------------------- |
| `fullyParallel`     | `false`                  | Tests share DB state, order matters       |
| `workers`           | `1`                      | Sequential execution for data consistency |
| `retries`           | `1` in CI, `0` local     | One retry to handle flaky browser startup |
| `trace`             | `on-first-retry`         | Captures trace only on failure            |
| `screenshot`        | `only-on-failure`        | Saves screenshots on failure              |
| `viewport`          | `1280x720`               | Standard desktop resolution               |
| `baseURL`           | `https://localhost:5173` | Vite dev server with self-signed certs    |
| `ignoreHTTPSErrors` | `true`                   | Self-signed cert in dev                   |

### Test Files

```text
apps/web/e2e/specs/
  storage.spec.ts             # DataStorage creation via UI
  datamart-create.spec.ts     # DataMart creation form + validation
  datamart-list.spec.ts       # DataMart list, search, status filter
  datamart-detail.spec.ts     # DataMart detail page + editing
  datamart-data-setup.spec.ts # Data Setup tab interactions
  datamart-tabs.spec.ts       # Tab navigation + console error detection
  destination.spec.ts         # DataDestination CRUD via UI
  report.spec.ts              # Report creation + editing
  trigger.spec.ts             # ScheduledTrigger creation + toggling
  run-history.spec.ts         # Run history list + log viewer
  notifications.spec.ts       # Notification settings + toggling
  lifecycle.spec.ts           # Full lifecycle: storage -> datamart -> publish
  oauth-skeletons.spec.ts     # OAuth connector skeleton pages
```

### data-testid Convention

Tests use `data-testid` attributes for stable selectors. Conventions:

- **Naming:** `camelCase` (e.g., `storageListPage`, `datamartCreateForm`)
- **Placement:** Only in `apps/web` components (never in `packages/ui`)
- **Scope:** Only add testids that tests actually use (minimal, incremental)

Current testids (41 total, defined in `apps/web/e2e/selectors/testids.ts`):

**Storage (6):**

| testid                | Purpose                          |
| --------------------- | -------------------------------- |
| `storageListPage`     | Page container                   |
| `storageTypeDialog`   | Type selection dialog visibility |
| `storageTable`        | Verify data rows                 |
| `storageConfigSheet`  | Config sheet visibility          |
| `storageEditForm`     | Edit form container              |
| `storageDeleteButton` | Delete action in context menu    |

**DataMart (13):**

| testid                  | Purpose                  |
| ----------------------- | ------------------------ |
| `datamartList`          | List wrapper             |
| `datamartTable`         | Table container          |
| `datamartCreateForm`    | Create form container    |
| `datamartCreatePage`    | Create page wrapper      |
| `datamartDetails`       | Detail page loaded check |
| `datamartTabNav`        | Scope tab link selectors |
| `datamartTabOverview`   | Overview tab content     |
| `datamartTabDataSetup`  | Data Setup tab content   |
| `datamartPublishButton` | Verify publish state     |
| `datamartDeleteButton`  | Delete action            |
| `datamartTitleInput`    | Inline title editing     |
| `datamartSearchInput`   | List search input        |
| `datamartStatusFilter`  | Status filter dropdown   |

**Destination (5):**

| testid             | Purpose                  |
| ------------------ | ------------------------ |
| `destTab`          | Destinations tab content |
| `destEmptyState`   | Empty state placeholder  |
| `destCreateButton` | New Destination button   |
| `destEditSheet`    | Edit sheet visibility    |
| `destCard`         | Destination card wrapper |

**Report (3):**

| testid               | Purpose               |
| -------------------- | --------------------- |
| `reportCreateButton` | Add Report button     |
| `reportEditSheet`    | Edit sheet visibility |
| `reportCard`         | Report card wrapper   |

**Trigger (6):**

| testid                | Purpose                 |
| --------------------- | ----------------------- |
| `triggerTab`          | Triggers tab content    |
| `triggerEmptyState`   | Empty state placeholder |
| `triggerCreateButton` | Add Trigger button      |
| `triggerEditSheet`    | Edit sheet visibility   |
| `triggerTable`        | Trigger table container |
| `triggerToggle`       | Enable/disable toggle   |

**Run History (4):**

| testid                 | Purpose                 |
| ---------------------- | ----------------------- |
| `runHistoryTab`        | Run History tab content |
| `runHistoryTable`      | Run list container      |
| `runHistoryEmptyState` | Empty state placeholder |
| `runLogView`           | Expanded log viewer     |

**Notifications (4):**

| testid               | Purpose                      |
| -------------------- | ---------------------------- |
| `notifPage`          | Notifications page container |
| `notifSettingsTable` | Settings table container     |
| `notifToggle`        | Enable/disable toggle        |
| `notifEditSheet`     | Edit sheet visibility        |

### Selector Strategy

Prefer in this order:

1. `page.getByTestId('storageTable')` — for containers, pages, sections
2. `page.getByRole('button', { name: 'New Storage' })` — for interactive elements
3. `page.getByText('Published')` — for verifying visible text
4. `page.getByPlaceholder('Enter title')` — for form inputs

**Scoping to avoid ambiguity:**

```typescript
// BAD: "Overview" link exists in both sidebar and tab nav
await page.getByRole('link', { name: 'Overview' }).click();

// GOOD: Scope to tab navigation container
const tabNav = page.getByTestId('datamartTabNav');
await tabNav.getByRole('link', { name: 'Overview', exact: true }).click();
```

### API-Assisted Testing

When UI actions require real cloud credentials (e.g., publishing needs valid storage config), use Playwright's built-in `page.request` to bypass the UI:

```typescript
// Set definition via API (UI requires configured storage)
await page.request.put(`/api/data-marts/${id}/definition`, {
  data: {
    definitionType: 'SQL',
    definition: { sqlQuery: 'SELECT 1 AS test_column' },
  },
});

// Publish via API
await page.request.put(`/api/data-marts/${id}/publish`);

// Reload to see updated UI state
await page.reload();
await expect(page.getByText('Published')).toBeVisible();
```

### Console Error Detection

Detect unexpected errors during navigation:

```typescript
const consoleErrors: string[] = [];

page.on('console', (msg: ConsoleMessage) => {
  if (msg.type() === 'error') {
    const text = msg.text();
    const isIgnorable =
      text.includes('intercom') ||
      text.includes('Intercom') ||
      text.includes('gtm') ||
      text.includes('googletagmanager') ||
      text.includes('analytics') ||
      text.includes('Failed to load resource') ||
      text.includes('net::ERR_') ||
      text.includes('Invalid DOM property') ||
      text.includes('Did you mean');
    if (!isIgnorable) {
      consoleErrors.push(text);
    }
  }
});

// ... navigate through pages ...

expect(consoleErrors).toEqual([]);
```

### Browser CI Workflow

**File:** `.github/workflows/e2e-browser.yml`

- **Trigger:** `workflow_dispatch` (manual)
- **Timeout:** 30 minutes
- **Artifacts:** HTML report (always), trace files (on failure)
- **Browser:** Chromium installed via `npx playwright install --with-deps chromium`

---

## Level 4: Real Database Integration Tests

Tests that validate cloud database adapters (BigQuery, Athena) against real cloud APIs. These catch SDK version issues, permission problems, and SQL dialect bugs that mocks cannot detect.

### Running Integration Tests

```bash
npm run test:integration -w @owox/backend
```

Without credentials, all 12 tests skip gracefully (exit code 0).
With credentials, tests create temporary tables, run queries, and clean up.

### Credential Setup

Create `.env.tests` at the project root (git-ignored via `.env.*` pattern):

```bash
# BigQuery
BQ_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
BQ_PROJECT_ID=your-gcp-project-id
BQ_DATASET=your_existing_dataset

# Athena
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your-secret-key
ATHENA_REGION=eu-west-1
ATHENA_OUTPUT_BUCKET=your-s3-bucket-name
ATHENA_DATABASE=your_existing_database
```

**Prerequisites:**

- BigQuery dataset must already exist
- Athena database must already exist (create via `CREATE DATABASE name` in Athena console)
- S3 bucket must exist and be accessible by the IAM user
- Service account / IAM user needs table create/drop + query permissions

The `setup-env.ts` file (loaded via Jest's `setupFiles`) first loads root `.env` for base configuration, then loads root `.env.tests` with `override: true` so test values take priority over `.env` defaults.

### Integration Test Architecture

```text
apps/backend/test/
  jest-integration.json            # Jest config (60s timeout, setupFiles)
  integration/
    setup-env.ts                   # Loads root .env then .env.tests (override) via dotenv
    bigquery.integration.ts        # 6 BigQuery tests
    athena.integration.ts          # 6 Athena tests
```

### Test Structure

Each integration test file follows the same pattern:

1. **Credential gating** — skip gracefully without credentials
2. **Table setup** in `beforeAll` — create a temporary test table
3. **Tests** — access validation, SQL dry run, schema read
4. **Table teardown** in `afterAll` — drop table, clean up artifacts

### Credential Gating Pattern

```typescript
const BQ_CREDENTIALS_AVAILABLE = !!(
  process.env.BQ_SERVICE_ACCOUNT_KEY &&
  process.env.BQ_PROJECT_ID &&
  process.env.BQ_DATASET
);

if (!BQ_CREDENTIALS_AVAILABLE) {
  console.log('Skipping BigQuery integration tests: credentials not set');
}

const describeIfCredentials = BQ_CREDENTIALS_AVAILABLE ? describe : describe.skip;

describeIfCredentials('BigQuery Integration Tests', () => {
  // tests here — only run when credentials are available
});
```

This ensures:

- `npm run test:integration` never fails for contributors without credentials
- CI with secrets runs the real tests
- Clear skip message in console output

### BigQuery Test Table

```typescript
// beforeAll: Create test table
const testTableName = `integration_test_${Date.now()}`;
const fullyQualifiedName = `${BQ_PROJECT_ID}.${BQ_DATASET}.${testTableName}`;

await adapter.executeQuery(
  `CREATE TABLE \`${fullyQualifiedName}\` (
    id INT64, name STRING, active BOOL, created_at TIMESTAMP, amount NUMERIC
  )`
);

// afterAll: Drop test table
await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fullyQualifiedName}\``);
```

**BigQuery identifier quoting:** Always use backticks (`` ` ``) for fully qualified table names.

### Athena Test Table

Athena uses CTAS (CREATE TABLE AS SELECT) for table creation and requires S3 storage:

```typescript
const TEST_TABLE_SUFFIX = `integration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_S3_PREFIX = `integration-test/${TEST_TABLE_SUFFIX}/`;

// beforeAll: Pre-cleanup (handles crashed previous runs)
await adapter.executeQuery(
  `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
  outputBucket,
  'integration-test/cleanup/'
);

// beforeAll: Create test table via CTAS
await adapter.executeQuery(
  `CREATE TABLE "${database}"."${TEST_TABLE_SUFFIX}"
   WITH (format = 'PARQUET', external_location = 's3://${outputBucket}/${TEST_S3_PREFIX}data/')
   AS SELECT
     1 AS id, 'test_name' AS name, true AS active,
     TIMESTAMP '2024-01-01 00:00:00.000' AS created_at`,
  outputBucket,
  'integration-test/ctas/'
);

// afterAll: Drop table + S3 cleanup
await adapter.executeQuery(
  `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
  outputBucket,
  'integration-test/drop/'
);
await s3Adapter.cleanupOutputFiles(outputBucket, `${TEST_S3_PREFIX}data/`);
await s3Adapter.cleanupOutputFiles(outputBucket, 'integration-test/');
```

#### Athena SQL Quoting Rules

Athena uses different SQL parsers for different statement types:

| Statement Type               | Parser | Quoting       | Example                                 |
| ---------------------------- | ------ | ------------- | --------------------------------------- |
| `DROP TABLE IF EXISTS`       | Hive   | Backticks     | `` DROP TABLE IF EXISTS `db`.`table` `` |
| `CREATE TABLE ... AS SELECT` | Trino  | Double quotes | `CREATE TABLE "db"."table" WITH ...`    |
| `SELECT`, `EXPLAIN`          | Trino  | Double quotes | `SELECT * FROM "db"."table"`            |

#### Athena TIMESTAMP Precision

Athena requires millisecond precision for timestamps:

```sql
-- WRONG: timestamp(0) — will fail with "Incorrect timestamp precision"
TIMESTAMP '2024-01-01 00:00:00'

-- CORRECT: timestamp(3) — millisecond precision
TIMESTAMP '2024-01-01 00:00:00.000'
```

### Timeout Configuration

Cloud API calls are slow. Use appropriate timeouts:

| Context               | Timeout   | Reason                 |
| --------------------- | --------- | ---------------------- |
| Jest global           | 60,000ms  | Default for all tests  |
| `beforeAll` (setup)   | 120,000ms | Table creation, CTAS   |
| `afterAll` (teardown) | 60,000ms  | Table drop, S3 cleanup |
| Individual tests      | 30,000ms  | Single API call        |

### Integration CI Workflow

**File:** `.github/workflows/test-integration.yml`

- **Triggers:** `workflow_dispatch` (manual) + nightly cron at 3 AM UTC
- **Timeout:** 30 minutes
- **Secrets required:** `BQ_PROJECT_ID`, `BQ_DATASET`, `BQ_SERVICE_ACCOUNT_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ATHENA_REGION`, `ATHENA_OUTPUT_BUCKET`, `ATHENA_DATABASE`

To configure secrets: Repository Settings > Secrets and variables > Actions > New repository secret.

---

## Writing New Tests

### Adding a Backend Unit Test

1. Create `your-service.spec.ts` next to `your-service.ts`
2. Use Jest mocks for dependencies:

```typescript
import { YourService } from './your-service';

describe('YourService', () => {
  let service: YourService;
  const mockDep = { method: jest.fn() };

  beforeEach(() => {
    service = new YourService(mockDep as any);
    jest.clearAllMocks();
  });

  it('should do something', () => {
    mockDep.method.mockReturnValue('result');
    expect(service.doSomething()).toBe('result');
  });
});
```

### Adding a Frontend Unit Test

1. Create `Component.test.tsx` next to `Component.tsx`
2. Use Vitest + Testing Library:

```typescript
import { render, screen } from '@testing-library/react';
import { Component } from './Component';

describe('Component', () => {
  it('renders title', () => {
    render(<Component title="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Adding an API E2E Test

1. Create `your-feature.e2e-spec.ts` in `apps/backend/test/`
2. Use `createTestApp` + Supertest:

```typescript
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { createTestApp, closeTestApp, StorageBuilder, AUTH_HEADER } from '@owox/test-utils';

describe('YourFeature API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('POST /api/your-endpoint - creates a resource', async () => {
    const res = await agent.post('/api/your-endpoint').set(AUTH_HEADER).send({ field: 'value' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ field: 'value' });
  });

  it('POST /api/your-endpoint - returns 400 for invalid payload', async () => {
    const res = await agent.post('/api/your-endpoint').set(AUTH_HEADER).send({});

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
  });
});
```

**E2E test naming:** `{feature}.e2e-spec.ts`
**Jest config:** `apps/backend/test/jest-e2e.json` (testRegex: `.e2e-spec.ts$`)

### Adding a Browser E2E Test

1. Create `your-feature.spec.ts` in `apps/web/e2e/specs/`
2. Add `data-testid` attributes to components you need to target
3. Write the test:

```typescript
import { test, expect } from '../fixtures/base';

test.describe('Your Feature', () => {
  // Use beforeEach for per-test setup (e.g., ensuring prerequisites exist)
  test.beforeEach(async ({ page }) => {
    await page.goto('/ui/0/data-storages');
    await expect(page.getByTestId('storageListPage')).toBeVisible();
  });

  test('performs a user workflow', async ({ page }) => {
    // Navigate
    await page.goto('/ui/0/your-feature');

    // Interact using role selectors
    await page.getByRole('button', { name: 'Create' }).click();

    // Fill forms
    await page.getByPlaceholder('Enter name').fill('Test Name');

    // Submit
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify result
    await expect(page).toHaveURL(/\/your-feature\/[^/]+/);
    await expect(page.getByText('Test Name')).toBeVisible();
  });
});
```

**When to use `beforeAll` vs `beforeEach`:**

- `beforeEach` — lightweight per-test setup (check prerequisites)
- `beforeAll` — expensive one-time setup (use separate browser context: `browser.newPage()`)

**When to use API-assisted tests:**
If a UI action requires external service configuration (cloud credentials, third-party API keys), use `page.request` to perform that step via the backend API instead.

### Adding a data-testid

1. Add to the React component in `apps/web`:

   ```tsx
   <div data-testid="yourFeaturePage">
   ```

2. Never add testids to `packages/ui` components
3. Use camelCase naming
4. Only add testids that tests actually use

### Adding a New Cloud Integration Test

1. Create `your-service.integration.ts` in `apps/backend/test/integration/`
2. Follow the credential gating pattern:

```typescript
const CREDENTIALS_AVAILABLE = !!(process.env.YOUR_API_KEY && process.env.YOUR_ENDPOINT);

if (!CREDENTIALS_AVAILABLE) {
  console.log('Skipping YourService integration tests: credentials not set');
}

const describeIfCredentials = CREDENTIALS_AVAILABLE ? describe : describe.skip;

describeIfCredentials('YourService Integration Tests', () => {
  let adapter: YourAdapter;

  beforeAll(async () => {
    adapter = new YourAdapter({
      apiKey: process.env.YOUR_API_KEY!,
      endpoint: process.env.YOUR_ENDPOINT!,
    });

    // Create test resources
  }, 120000);

  afterAll(async () => {
    // Clean up test resources (always in try/catch)
    try {
      await adapter.deleteTestResource();
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  }, 60000);

  describe('Access Validation', () => {
    it('should accept valid credentials', async () => {
      await expect(adapter.checkAccess()).resolves.not.toThrow();
    }, 30000);

    it('should reject invalid credentials', async () => {
      const invalid = new YourAdapter({ apiKey: 'INVALID' });
      await expect(invalid.checkAccess()).rejects.toThrow();
    }, 30000);
  });

  // ... more test groups ...
});
```

1. Add env vars to root `.env.tests`
2. Add secrets to `.github/workflows/test-integration.yml`

### Integration Test Checklist

- [ ] Credential gating with `describeIfCredentials` pattern
- [ ] Clear skip message when credentials absent
- [ ] Unique test resource names (include `Date.now()` or random suffix)
- [ ] Pre-cleanup in `beforeAll` for crashed previous runs
- [ ] Full cleanup in `afterAll` wrapped in `try/catch`
- [ ] Appropriate timeouts (120s setup, 60s teardown, 30s per test)
- [ ] No NestJS DI — manually instantiate adapters/providers
- [ ] Env vars documented in file header comment

---

## CI Workflows Summary

| Workflow    | File                   | Trigger                   | What                                   |
| ----------- | ---------------------- | ------------------------- | -------------------------------------- |
| Unit Tests  | `test-owox.yml`        | PR, push to main          | Backend + Web + CLI unit tests         |
| API E2E     | `e2e-api.yml`          | Manual dispatch           | Backend API integration tests (SQLite) |
| Browser E2E | `e2e-browser.yml`      | Manual dispatch           | Playwright browser tests               |
| Integration | `test-integration.yml` | Manual + nightly 3 AM UTC | BigQuery + Athena real database tests  |
| Docs Build  | `test-docs.yml`        | PR to docs                | Documentation build verification       |

### GitHub Secrets for Integration Tests

Configure in: Repository Settings > Secrets and variables > Actions

| Secret                   | Service  | Description                            |
| ------------------------ | -------- | -------------------------------------- |
| `BQ_SERVICE_ACCOUNT_KEY` | BigQuery | JSON string of GCP service account key |
| `BQ_PROJECT_ID`          | BigQuery | GCP project ID                         |
| `BQ_DATASET`             | BigQuery | BigQuery dataset name (must exist)     |
| `AWS_ACCESS_KEY_ID`      | Athena   | AWS IAM access key                     |
| `AWS_SECRET_ACCESS_KEY`  | Athena   | AWS IAM secret key                     |
| `ATHENA_REGION`          | Athena   | AWS region (e.g., `eu-west-1`)         |
| `ATHENA_OUTPUT_BUCKET`   | Athena   | S3 bucket for query results            |
| `ATHENA_DATABASE`        | Athena   | Athena database name (must exist)      |

---

## File Reference

| File                                             | Purpose                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| `apps/backend/package.json`                      | Jest unit config (inline), npm scripts                    |
| `apps/backend/test/jest-e2e.json`                | Jest config for API E2E tests                             |
| `apps/backend/test/jest-integration.json`        | Jest config for real DB tests                             |
| `apps/backend/test/jest-e2e-resolver.js`         | ESM `.js` -> `.ts` import resolver                        |
| `apps/backend/test/integration/setup-env.ts`     | Loads root `.env` then `.env.tests` (override) via dotenv |
| `apps/backend/test/*.e2e-spec.ts`                | API E2E test files                                        |
| `apps/backend/test/integration/*.integration.ts` | Real DB integration tests                                 |
| `apps/web/playwright.config.ts`                  | Playwright configuration                                  |
| `apps/web/e2e/specs/*.spec.ts`                   | Browser E2E test files                                    |
| `apps/web/vitest.config.ts`                      | Vitest config for frontend unit tests                     |
| `packages/test-utils/src/`                       | Shared test utilities (app bootstrap, builders)           |
| `.github/workflows/test-*.yml`                   | CI workflow definitions                                   |
| `.github/workflows/e2e-*.yml`                    | E2E CI workflow definitions                               |
