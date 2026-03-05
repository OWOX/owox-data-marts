# @owox/test-utils

Shared test utilities for bootstrapping the NestJS application, building test data payloads, and setting up common prerequisite chains.

## Directory Structure

```text
test-utils/
├── README.md
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                              # Re-exports constants, helpers, fixtures
    ├── constants.ts                          # AUTH_HEADER, NONEXISTENT_UUID, LOOKER_STUDIO_CONFIG, LOOKER_STUDIO_CREDENTIALS, DEFAULT_CRON, ALL_CONNECTORS
    ├── helpers/
    │   ├── index.ts
    │   ├── create-test-app.ts                # createTestApp() and closeTestApp()
    │   ├── setup-published-data-mart.ts      # setupPublishedDataMart() — SQL definition chain
    │   ├── setup-connector-data-mart.ts      # setupConnectorDataMart() — CONNECTOR definition chain
    │   ├── setup-report-prerequisites.ts     # setupReportPrerequisites() — storage+DM+dest+report
    │   └── truncate-all-tables.ts            # truncateAllTables() — cleanup helper
    └── fixtures/
        ├── index.ts
        ├── storage.builder.ts                # StorageBuilder
        ├── data-mart.builder.ts              # DataMartBuilder
        ├── data-destination.builder.ts       # DataDestinationBuilder
        ├── report.builder.ts                 # ReportBuilder
        └── scheduled-trigger.builder.ts      # ScheduledTriggerBuilder
```

## Usage

```typescript
import {
  createTestApp,
  closeTestApp,
  AUTH_HEADER,
  NONEXISTENT_UUID,
  StorageBuilder,
  DataMartBuilder,
  DataDestinationBuilder,
  ReportBuilder,
  ScheduledTriggerBuilder,
  setupPublishedDataMart,
  setupConnectorDataMart,
  setupReportPrerequisites,
  truncateAllTables,
} from '@owox/test-utils';
```

## API

### Constants

#### `AUTH_HEADER`

Pre-built auth header for test requests using `NullIdpProvider`.

```typescript
AUTH_HEADER // { 'x-owox-authorization': 'test-token' }
```

Use with Supertest: `.set(AUTH_HEADER)`.

#### `NONEXISTENT_UUID`

A zeroed UUID guaranteed not to exist in the database, for 404 tests.

```typescript
NONEXISTENT_UUID // '00000000-0000-0000-0000-000000000000'
```

#### `LOOKER_STUDIO_CONFIG`

Default Looker Studio destination config for report tests.

```typescript
LOOKER_STUDIO_CONFIG // { type: 'looker-studio-config', cacheLifetime: 3600 }
```

#### `LOOKER_STUDIO_CREDENTIALS`

Default Looker Studio credentials for destination tests.

```typescript
LOOKER_STUDIO_CREDENTIALS // { type: 'looker-studio-credentials' }
```

#### `DEFAULT_CRON`

Default cron expression for trigger tests.

```typescript
DEFAULT_CRON // '0 * * * *'
```

#### `ALL_CONNECTORS`

Array of all 14 connector names, useful for parameterized connector tests.

```typescript
ALL_CONNECTORS
// ['BankOfCanada', 'CriteoAds', 'FacebookMarketing', 'GitHub', 'GoogleAds',
//  'LinkedInAds', 'LinkedInPages', 'MicrosoftAds', 'OpenExchangeRates',
//  'OpenHolidays', 'RedditAds', 'Shopify', 'TikTokAds', 'XAds']
```

### Helpers

#### `createTestApp()`

Bootstraps a production-equivalent NestJS application backed by SQLite `:memory:`.

```typescript
const { app, agent } = await createTestApp();
```

**Returns:**

- `app: INestApplication` -- the NestJS app instance (for cleanup)
- `agent: supertest.Agent` -- pre-configured Supertest agent for HTTP requests

**What it does (in order):**

1. Sets environment variables: `DB_TYPE=sqlite`, `SQLITE_DB_PATH=:memory:`, `NODE_ENV=test`
2. Initializes `typeorm-transactional` context (global singleton, safe for Jest workers)
3. Creates Express app with `NullIdpProvider` (accepts any auth token)
4. Registers IDP middleware on Express
5. Compiles `AppModule` via `@nestjs/testing`
6. Creates NestJS app on the Express adapter
7. Sets global prefix `api`, validation pipes, exception filters
8. Enables foreign key constraints: `PRAGMA foreign_keys = ON`
9. Runs all migrations: `dataSource.runMigrations()`
10. Initializes the app: `app.init()`
11. Creates Supertest agent bound to the app's HTTP server

**Important details:**

- All imports are resolved from the backend workspace to avoid module duplication
- Uses `require.resolve()` with explicit paths for singleton consistency
- `NullIdpProvider` means any `x-owox-authorization: <any-value>` header is accepted
- Migrations run against real TypeORM entities -- schema matches production exactly
- Each call creates a fresh isolated database (`:memory:` = unique per connection)

#### `closeTestApp(app)`

Closes the NestJS application and cleans up resources.

```typescript
await closeTestApp(app);
```

Always call this in `afterAll`. Failure to close leaves database connections and HTTP server hanging.

#### `setupPublishedDataMart(agent)`

Creates a full storage -> data mart -> SQL definition -> publish chain via HTTP.

```typescript
const { storageId, dataMartId } = await setupPublishedDataMart(agent);
```

**Steps performed:**

1. Creates a Google BigQuery storage
2. Creates a data mart linked to that storage
3. Sets a SQL definition (`SELECT 1`)
4. Publishes the data mart

**Returns:** `{ storageId: string, dataMartId: string }`

#### `setupConnectorDataMart(agent)`

Creates a full storage -> data mart -> CONNECTOR definition -> publish chain via HTTP.

```typescript
const { storageId, dataMartId } = await setupConnectorDataMart(agent);
```

Uses the OpenHolidays connector (no OAuth/secrets required). The resulting data mart has status PUBLISHED with a CONNECTOR definition.

**Returns:** `{ storageId: string, dataMartId: string }`

#### `setupReportPrerequisites(agent)`

Creates the full prerequisite chain for report tests: storage -> data mart -> definition -> publish -> data destination.

```typescript
const { storageId, dataMartId, dataDestinationId } = await setupReportPrerequisites(agent);
```

Uses LOOKER_STUDIO destination type because GOOGLE_SHEETS credential validation calls real Google APIs and will fail in test environments.

**Returns:** `{ storageId: string, dataMartId: string, dataDestinationId: string }`

#### `truncateAllTables(dataSource)`

Deletes all rows from all non-system tables in the SQLite database. Excludes `sqlite_*` internal tables and the `migrations` table. Temporarily disables foreign keys during cleanup, then re-enables them.

```typescript
const dataSource = app.get(DataSource);
await truncateAllTables(dataSource);
```

### Builders

#### `StorageBuilder`

Fluent builder for DataStorage creation payloads.

```typescript
// Default: Google BigQuery storage
const payload = new StorageBuilder().build();
// { type: 'GOOGLE_BIGQUERY' }

// Custom type
const athena = new StorageBuilder()
  .withType(DataStorageType.AWS_ATHENA)
  .build();
// { type: 'AWS_ATHENA' }
```

**Methods:**

- `.withType(type: DataStorageType)` -- set storage type (default: `GOOGLE_BIGQUERY`)
- `.build()` -- returns `{ type: string }`

#### `DataMartBuilder`

Fluent builder for DataMart creation payloads.

```typescript
const payload = new DataMartBuilder()
  .withTitle('My DataMart')
  .withStorageId('uuid-from-storage-creation')
  .build();
// { title: 'My DataMart', storageId: 'uuid-...' }
```

**Methods:**

- `.withTitle(title: string)` -- set title (default: `'Test Data Mart'`)
- `.withStorageId(storageId: string)` -- **required** -- set the parent storage ID
- `.build()` -- returns `{ title: string, storageId: string }`. Throws if `storageId` is not set.

#### `DataDestinationBuilder`

Fluent builder for DataDestination creation payloads.

```typescript
// Default: Google Sheets destination
const payload = new DataDestinationBuilder().build();
// { title: 'Test Destination', type: 'GOOGLE_SHEETS' }

// Looker Studio with credentials
const looker = new DataDestinationBuilder()
  .withTitle('My Looker Destination')
  .withType(DataDestinationType.LOOKER_STUDIO)
  .withCredentials({ type: 'looker-studio-credentials' })
  .build();
```

**Methods:**

- `.withTitle(title: string)` -- set title (default: `'Test Destination'`)
- `.withType(type: DataDestinationType)` -- set destination type (default: `GOOGLE_SHEETS`)
- `.withCredentials(credentials: Record<string, unknown>)` -- set credentials
- `.build()` -- returns `{ title: string, type: string, credentials?: Record<string, unknown> }`

#### `ReportBuilder`

Fluent builder for Report creation payloads.

```typescript
const payload = new ReportBuilder()
  .withDataMartId('dm-uuid')
  .withDataDestinationId('dest-uuid')
  .build();
// { title: 'Test Report', dataMartId: 'dm-uuid', dataDestinationId: 'dest-uuid',
//   destinationConfig: { type: 'looker-studio-config', cacheLifetime: 3600 } }
```

**Methods:**

- `.withTitle(title: string)` -- set title (default: `'Test Report'`)
- `.withDataMartId(dataMartId: string)` -- **required** -- set the data mart ID
- `.withDataDestinationId(dataDestinationId: string)` -- **required** -- set the data destination ID
- `.withDestinationConfig(config: Record<string, unknown>)` -- set destination config (default: Looker Studio config)
- `.build()` -- returns the full payload. Throws if `dataMartId` or `dataDestinationId` is not set.

#### `ScheduledTriggerBuilder`

Fluent builder for ScheduledTrigger creation payloads.

```typescript
const payload = new ScheduledTriggerBuilder()
  .withCronExpression('0 6 * * *')
  .withIsActive(true)
  .build();
// { type: 'CONNECTOR_RUN', cronExpression: '0 6 * * *', timeZone: 'UTC', isActive: true }
```

**Methods:**

- `.withType(type: ScheduledTriggerType)` -- set trigger type (default: `CONNECTOR_RUN`)
- `.withCronExpression(cron: string)` -- set cron expression (default: `'0 * * * *'`)
- `.withTimeZone(tz: string)` -- set time zone (default: `'UTC'`)
- `.withIsActive(isActive: boolean)` -- set active state
- `.withTriggerConfig(config: Record<string, unknown>)` -- set trigger config
- `.build()` -- returns the full payload

## Common Patterns

### Full Test Setup

```typescript
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  AUTH_HEADER,
  StorageBuilder,
  DataMartBuilder,
} from '@owox/test-utils';

describe('Feature (e2e)', () => {
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

  it('creates a resource', async () => {
    const res = await agent.post('/api/endpoint').set(AUTH_HEADER).send({ data: 'value' });
    expect(res.status).toBe(201);
  });
});
```

### Creating Test Data with Dependencies

DataMart requires a DataStorage (foreign key constraint):

```typescript
// 1. Create storage
const storagePayload = new StorageBuilder().build();
const storageRes = await agent.post('/api/data-storages').set(AUTH_HEADER).send(storagePayload);
const storageId = storageRes.body.id;

// 2. Create data mart with that storage
const dmPayload = new DataMartBuilder()
  .withTitle('Test DM')
  .withStorageId(storageId)
  .build();
const dmRes = await agent.post('/api/data-marts').set(AUTH_HEADER).send(dmPayload);
```

### Using Setup Helpers to Skip Boilerplate

When your test needs a published data mart but the test focus is elsewhere:

```typescript
import { setupPublishedDataMart, setupReportPrerequisites, AUTH_HEADER } from '@owox/test-utils';

// For tests that need a published data mart
const { storageId, dataMartId } = await setupPublishedDataMart(agent);

// For tests that need a full report chain
const { storageId, dataMartId, dataDestinationId } = await setupReportPrerequisites(agent);
```

### Testing 404 Responses

```typescript
import { NONEXISTENT_UUID, AUTH_HEADER } from '@owox/test-utils';

const res = await agent.get(`/api/data-marts/${NONEXISTENT_UUID}`).set(AUTH_HEADER);
expect(res.status).toBe(404);
```

### Parameterized Connector Tests

```typescript
import { ALL_CONNECTORS } from '@owox/test-utils';

describe.each(ALL_CONNECTORS)('connector %s', (connectorName) => {
  it('should be listed', async () => {
    // test each connector
  });
});
```

## Extending

### Adding a New Builder

1. Create `your-entity.builder.ts` in `src/fixtures/`
1. Follow the pattern shown below
1. Export from `src/fixtures/index.ts`

```typescript
export interface YourEntityCreatePayload {
  name: string;
  parentId: string;
}

export class YourEntityBuilder {
  private payload: YourEntityCreatePayload = {
    name: 'Default Name',
    parentId: '',
  };

  withName(name: string): this {
    this.payload.name = name;
    return this;
  }

  withParentId(parentId: string): this {
    this.payload.parentId = parentId;
    return this;
  }

  build(): YourEntityCreatePayload {
    if (!this.payload.parentId) {
      throw new Error('YourEntityBuilder: parentId required. Call .withParentId()');
    }
    return { ...this.payload };
  }
}
```

### Adding a New Helper

1. Create `your-helper.ts` in `src/helpers/`
2. Export from `src/helpers/index.ts`

### Adding a New Constant

1. Add the constant to `src/constants.ts`
2. It will be automatically re-exported via `src/index.ts`
