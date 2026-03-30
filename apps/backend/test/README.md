# Backend Tests

This directory contains API E2E tests and integration test configuration for the backend.

## Directory Structure

```text
test/
├── README.md                          # This file
├── jest-e2e.json                      # Jest config for API E2E tests
├── jest-e2e-resolver.js               # Custom resolver: maps .js imports to .ts files (ESM compat)
├── jest-integration.json              # Jest config for real database integration tests
├── smoke.e2e-spec.ts                  # Smoke test: app boots, DB responds, PRAGMA FK enabled
├── data-storage.e2e-spec.ts           # DataStorage CRUD: create, list, get, update, delete, validation
├── data-mart.e2e-spec.ts              # DataMart CRUD: create, list, get, update title, set definition,
│                                      #   publish (DRAFT->PUBLISHED), delete, validation
├── data-mart-extended.e2e-spec.ts     # Filter by connector, batch health status, clone definition
├── data-mart-runs.e2e-spec.ts         # Manual runs: trigger, cancel, get, list, pagination, 404
├── data-destination.e2e-spec.ts       # DataDestination CRUD: create, get, list, list-by-type,
│                                      #   update, rotate secret key, delete, validation
├── report.e2e-spec.ts                 # Report CRUD: create, get, list by DataMart, list all,
│                                      #   update, fire-and-forget run, delete, validation
├── scheduled-trigger.e2e-spec.ts      # Scheduled trigger CRUD + cross-DataMart isolation
├── error-handling.e2e-spec.ts         # Cross-cutting: 404s, 400s, malformed UUIDs, FK violations,
│                                      #   cascade delete (Reports, Triggers, Runs), duplicates
├── validation-schema.e2e-spec.ts      # DataMart validate-definition, update schema, update description
├── connector-list.e2e-spec.ts         # GET /api/connectors -- list all connectors with structural checks
├── connector-fields.e2e-spec.ts       # GET /api/connectors/:name/fields -- deep field schema validation
├── connector-specification.e2e-spec.ts  # GET /api/connectors/:name/specification -- per-auth-type checks
├── connector-oauth.e2e-spec.ts        # Connector OAuth settings (credential-gated; vars + isEnabled)
└── integration/                       # Real database integration tests (see integration/README.md)
    ├── README.md
    ├── setup-env.ts
    ├── bigquery.integration.ts
    └── athena.integration.ts
```

## API E2E Tests

**Command:** `npm run test:e2e -w @owox/backend`
**Config:** `jest-e2e.json` (testRegex: `.e2e-spec.ts$`, timeout: 30s)
**Dependencies:** None -- uses SQLite `:memory:` via `@owox/test-utils`

### How It Works

`createTestApp()` from `@owox/test-utils` bootstraps a full NestJS application with:

- SQLite `:memory:` database (no file system needed)
- Real migrations applied (`dataSource.runMigrations()`)
- Foreign key constraints enabled (`PRAGMA foreign_keys = ON`)
- `NullIdpProvider` for auth (any `x-owox-authorization` value accepted)
- Global validation pipes and exception filters matching production

Tests use Supertest to make real HTTP requests to the app.

### Test Files

#### `smoke.e2e-spec.ts`

Basic health check. Verifies the app boots without errors, `GET /api/data-storages` responds
with 200, and SQLite PRAGMA `foreign_keys = ON` is enforced.

#### `data-storage.e2e-spec.ts`

Full DataStorage CRUD lifecycle (order-dependent). Create with `GOOGLE_BIGQUERY` type, list,
get by ID, update (returns 400 without real cloud credentials), verify failed update does not
corrupt data, delete (soft), verify 404 after deletion, and DTO validation for missing/invalid fields.

#### `data-mart.e2e-spec.ts`

Full DataMart CRUD + publish lifecycle (order-dependent). Creates a DataStorage in `beforeAll`
(FK dependency), then: create DataMart, list (paginated), get by ID (DRAFT status), update title,
set SQL definition, publish (DRAFT -> PUBLISHED), delete, and validation for missing fields / empty title.

#### `data-mart-extended.e2e-spec.ts`

Extended DataMart operations. Uses `setupPublishedDataMart` helper. Tests filter by connector
(SQL-type excluded), batch health status (valid IDs, non-existent IDs, empty array, >200 limit),
and clone definition via `sourceDataMartId`.

#### `data-mart-runs.e2e-spec.ts`

Manual run lifecycle (order-dependent). Uses `setupConnectorDataMart` helper (CONNECTOR-type
DataMart required). Trigger manual run, cancel pending run, trigger second run, get run by ID,
list run history, pagination with limit/offset, and 404 for non-existent DataMart.

#### `data-destination.e2e-spec.ts`

Full DataDestination CRUD lifecycle (order-dependent). Create LOOKER_STUDIO destination, get by ID,
list all, list by type (simplified response shape), update title, rotate secret key (twice -- verifies
different keys), delete (soft), verify 404 after deletion, and validation for empty body / invalid type enum.

#### `report.e2e-spec.ts`

Full Report CRUD lifecycle (order-dependent). Uses `setupReportPrerequisites` helper to create
DataMart + DataDestination. Create report (LOOKER_STUDIO deterministic UUID), get by ID, list by
DataMart, list all, update (title + destinationConfig), fire-and-forget run, delete, verify 404,
validation for empty body, 404 for non-existent dataMartId, and list by insight template.

#### `scheduled-trigger.e2e-spec.ts`

Full ScheduledTrigger CRUD lifecycle (order-dependent). Uses `setupConnectorDataMart` helper.
Create CONNECTOR_RUN trigger with cron/timeZone, get by ID, list for DataMart, update
(cron/timeZone/isActive), delete, verify 404 after deletion, validation for invalid cron /
missing fields / invalid type enum, and cross-DataMart isolation (triggers on A do not appear in B).

#### `error-handling.e2e-spec.ts`

Cross-cutting error handling. Uses both `setupReportPrerequisites` and `setupConnectorDataMart`.
Tests non-existent UUID returns 404 (reports, destinations, triggers), malformed UUID handling
(no ParseUUIDPipe -- falls through to 404), FK constraint violations (non-existent parent returns
404), cascade delete (DataMart deletion cascades to child Reports, Triggers, and Runs), and
duplicate creation behavior (DataDestination/Trigger succeed with different IDs; Report with
deterministic UUID returns 409/500).

#### `validation-schema.e2e-spec.ts`

DataMart definition validation and schema management. Uses `setupPublishedDataMart` helper.
Tests validate-definition endpoint (returns `{ valid }` shape), update schema with BigQuery
field array, update description, 400 for empty schema object, and validate-definition on a
draft DataMart without definition (returns `valid: false` with errorMessage).

#### `connector-list.e2e-spec.ts`

`GET /api/connectors` returns all connectors with required fields (name, title, logo, docUrl).
Verifies count matches `ALL_CONNECTORS` constant and every known connector name is present.

#### `connector-fields.e2e-spec.ts`

`GET /api/connectors/:name/fields` deep validation. Tests 6 representative connectors
(2 public API, 2 API key, 2 OAuth) with deep node/field/uniqueKey checks. Verifies 404
for non-existent connector. Verifies all connectors have well-formed fields schemas.

#### `connector-specification.e2e-spec.ts`

`GET /api/connectors/:name/specification` per auth type. Public API connectors have no
OAUTH_FLOW attribute; API key connectors have SECRET attribute; OAuth connectors have OAUTH_FLOW
attribute with AuthType field and variant value. Verifies 404 for non-existent connector.
Verifies all connectors have well-formed specification schemas.

#### `connector-oauth.e2e-spec.ts`

`GET /api/connectors/:name/oauth/settings` for 4 OAuth connectors (GoogleAds, FacebookMarketing,
TikTokAds, MicrosoftAds). Dynamically discovers OAuth field path from specification, then
validates vars (non-empty object, per-var key/value types) and isEnabled (boolean, false in
test env). Also tests non-OAuth connector edge case (OpenHolidays returns empty vars, isEnabled false).

### Patterns

**Authentication:**

```typescript
import { AUTH_HEADER } from '@owox/test-utils';
await agent.get('/api/endpoint').set(AUTH_HEADER);
```

**Fixture builders:**

```typescript
import { StorageBuilder, DataMartBuilder, DataDestinationBuilder, ReportBuilder, ScheduledTriggerBuilder } from '@owox/test-utils';

const storage = new StorageBuilder().withType('GOOGLE_BIGQUERY').build();
const datamart = new DataMartBuilder().withTitle('Test').withStorageId(id).build();
const destination = new DataDestinationBuilder().withType(DataDestinationType.LOOKER_STUDIO).withCredentials(LOOKER_STUDIO_CREDENTIALS).build();
const report = new ReportBuilder().withDataMartId(id).withDataDestinationId(destId).build();
const trigger = new ScheduledTriggerBuilder().withCronExpression('0 * * * *').build();
```

**Composite setup helpers:**

```typescript
import { setupPublishedDataMart, setupConnectorDataMart, setupReportPrerequisites } from '@owox/test-utils';

// Creates Storage + DataMart + definition + publish (PUBLISHED, SQL-type)
const { storageId, dataMartId } = await setupPublishedDataMart(agent);

// Creates Storage + DataMart with CONNECTOR-type definition + publish
const { dataMartId } = await setupConnectorDataMart(agent);

// Creates Storage + published DataMart + DataDestination (LOOKER_STUDIO)
const { dataMartId, dataDestinationId } = await setupReportPrerequisites(agent);
```

**Constants:**

```typescript
import { AUTH_HEADER, NONEXISTENT_UUID, ALL_CONNECTORS, LOOKER_STUDIO_CREDENTIALS } from '@owox/test-utils';
```

**Test order matters:** Tests within a `describe` block run sequentially and share state (e.g., `createdStorageId`). This is intentional -- it models the full CRUD lifecycle in order. Each spec file documents the expected order via comments (e.g., `// Tests are order-dependent: Create -> List -> Get -> ...`).

### Adding a New API E2E Test

1. Create `your-feature.e2e-spec.ts` in this directory
2. Import `createTestApp`, `closeTestApp` from `@owox/test-utils`
3. Use `beforeAll`/`afterAll` for app lifecycle (not `beforeEach` -- app bootstrap is expensive)
4. Import `AUTH_HEADER` from `@owox/test-utils` and include it on every request
5. Use composite helpers (`setupPublishedDataMart`, `setupConnectorDataMart`, `setupReportPrerequisites`) when your test needs pre-existing entities
6. Test both happy path and error cases (400 for invalid input, 404 for missing resources)

### Config Files

#### `jest-e2e.json`

- `testRegex`: `.e2e-spec.ts$` -- only runs files ending in `.e2e-spec.ts`
- `transform`: `ts-jest` with CommonJS module output
- `moduleNameMapper`: `^src/(.*)$` -> `<rootDir>/../src/$1` (resolve `src/` imports)
- `resolver`: `jest-e2e-resolver.js` for ESM import compatibility

#### `jest-e2e-resolver.js`

Custom Jest resolver that handles ESM-style imports. When code imports `./file.js`, this resolver checks if `./file.ts` exists and returns that instead. This allows running TypeScript tests against source that uses `.js` extensions in imports (ESM convention).

#### `jest-integration.json`

- `testRegex`: `.integration.ts$` -- only runs files ending in `.integration.ts`
- `setupFiles`: `["<rootDir>/integration/setup-env.ts"]` -- loads root `.env` then `.env.tests` (with override) before tests
- `testTimeout`: 60000ms -- cloud API calls are slow
- Same resolver and transform as `jest-e2e.json`
