# Browser E2E Tests (Playwright)

End-to-end tests that drive a real Chromium browser against the full running stack (NestJS backend + Vite frontend). These tests validate user-facing workflows: clicking buttons, filling forms, navigating pages, and verifying visible results.

## Directory Structure

```text
e2e/
├── README.md                        # This file
├── fixtures/
│   ├── base.ts                      # Custom test.extend with apiHelpers + radix fixtures
│   └── api-helpers.ts               # ApiHelpers class -- entity CRUD via page.request
├── helpers/
│   ├── radix.ts                     # RadixHelpers class -- Radix UI component interaction
│   └── credentials.ts               # describeIfCredentials -- env-var-gated test suites
├── selectors/
│   └── testids.ts                   # Centralized TESTIDS constant (41 data-testid values)
└── specs/
    ├── storage.spec.ts              # Storage type creation, config sheet, validation, delete
    ├── datamart-create.spec.ts      # DataMart creation form + validation
    ├── datamart-list.spec.ts        # DataMart list: empty state, table, search, status filter, row nav, delete
    ├── datamart-detail.spec.ts      # DataMart detail: title edit, delete, manual run, status badge, publish
    ├── datamart-data-setup.spec.ts  # DataMart data setup: storage card, SQL editor, connector wizard
    ├── datamart-tabs.spec.ts        # Tab navigation + console error detection
    ├── destination.spec.ts          # Destinations: empty state, CRUD per type (parameterized)
    ├── report.spec.ts               # Reports: Looker Studio card toggle, Email table CRUD, list, run
    ├── trigger.spec.ts              # Triggers: empty state, create, edit, toggle, delete, validation
    ├── run-history.spec.ts          # Run history: empty state, manual run, status badge, timestamps, log views
    ├── notifications.spec.ts        # Notification settings: page render, toggle, edit sheet
    ├── lifecycle.spec.ts            # Full lifecycle: storage -> datamart -> definition -> publish
    └── oauth-skeletons.spec.ts      # OAuth connector skeletons (all skipped, credential-gated)
```

## Getting Started

```bash
# From apps/web/:

# First time: install Chromium
npx playwright install chromium

# Run all tests
npx playwright test

# Run a specific test file
npx playwright test e2e/specs/storage.spec.ts

# Run with visible browser (headed mode)
npx playwright test --headed

# Run with Playwright UI (interactive debugging)
npx playwright test --ui

# View last HTML report
npx playwright show-report
```

All commands run from `apps/web/`.

### Environment

Playwright config loads environment files at startup:

1. Root `.env` -- base configuration
2. Root `.env.tests` -- test overrides (loaded with `override: true`)

This ensures the backend uses the test database (`SQLITE_DB_PATH` from `.env.tests`) instead of the dev database from `.env`.

### Server Startup

Playwright auto-starts both servers (configured in `playwright.config.ts`):

1. **Backend:** `node dist/src/main.js` on `http://localhost:3000`
   - Must be built first: `npm run build -w @owox/backend`
   - Health check: waits for `http://localhost:3000/api/flags` to respond
   - Timeout: 120s for startup
   - Environment overrides: `NODE_ENV=test`, `PORT=3000`, plus server timeout settings
2. **Frontend:** `npx vite --config vite.config.ts` on `https://localhost:5173`
   - Uses self-signed certificates (HTTPS)
   - Timeout: 120s for startup

**Important:** Playwright always starts its own servers (`reuseExistingServer: false`). An `assertPortFree()` check runs before server startup -- if ports 3000 or 5173 are already in use (e.g., you have a dev server running), Playwright will fail immediately with a clear error asking you to stop the existing server. This prevents tests from accidentally running against a dev server with the wrong environment.

**NOTE:** The backend runs from compiled JS (`node dist/src/main.js`). If you change backend code, you must rebuild (`npm run build -w @owox/backend`) or tests will execute against stale code. CI workflows handle this via an explicit build step.

### Configuration

**File:** `apps/web/playwright.config.ts`

| Setting | Value | Reason |
|---------|-------|--------|
| `testDir` | `./e2e/specs` | All spec files live in the specs subdirectory |
| `fullyParallel` | `false` | Tests create data -- ordering prevents conflicts |
| `workers` | `1` | Sequential execution for shared DB state |
| `retries` | `0` (local), `1` (CI) | One retry for flaky browser startup in CI |
| `reporter` | `html` + `list` | HTML report (open: never) plus console list output |
| `trace` | `on-first-retry` | Captures trace on retry -- useful for debugging CI failures |
| `screenshot` | `only-on-failure` | Automatic screenshots on failure |
| `viewport` | `1280x720` | Standard desktop resolution |
| `baseURL` | `https://localhost:5173` | Vite dev server with self-signed cert |
| `ignoreHTTPSErrors` | `true` | Accept self-signed certificate |

## Fixtures

All spec files import `test` and `expect` from the custom fixture layer instead of `@playwright/test` directly:

```typescript
import { test, expect } from '../fixtures/base';
```

The custom `test.extend` in `fixtures/base.ts` provides two additional fixtures:

| Fixture | Type | Description |
|---------|------|-------------|
| `apiHelpers` | `ApiHelpers` | Entity CRUD operations via `page.request` (shares browser session) |
| `radix` | `RadixHelpers` | Interaction helpers for Radix UI components (portal-aware) |

Both fixtures are automatically instantiated per test -- just destructure them:

```typescript
test('example', async ({ page, apiHelpers, radix }) => {
  // page, apiHelpers, and radix are all available
});
```

## ApiHelpers

Located in `fixtures/api-helpers.ts`. Uses `page.request` to make API calls that share the browser's session/cookies.

### Core Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createStorage(type?)` | `{ id }` | Creates a DataStorage (default: `GOOGLE_BIGQUERY`) |
| `createDataMart(storageId, title?)` | `{ id }` | Creates a DataMart linked to a storage |
| `setDefinition(dataMartId, sqlQuery?)` | `void` | Sets SQL definition on a DataMart |
| `publish(dataMartId)` | `void` | Publishes a DataMart |
| `setConnectorDefinition(dataMartId)` | `void` | Sets a Bank of Canada connector definition on a DataMart |
| `createDestination(type?, title?)` | `{ id }` | Creates a DataDestination (default: `LOOKER_STUDIO`) |
| `deleteDestination(id)` | `void` | Deletes a DataDestination by ID |
| `createReport(dataMartId, dataDestinationId, title?)` | `{ id }` | Creates a Report linking a DataMart to a destination |
| `createTrigger(dataMartId)` | `{ id }` | Creates a CONNECTOR_RUN scheduled trigger (daily at 09:00 UTC) |

### Composite Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `createPublishedDataMart(title?)` | `{ storage, datamart }` | Creates storage + datamart + SQL definition + publish in one call |
| `createPublishedConnectorDataMart(title?)` | `{ storage, datamart }` | Creates storage + datamart + Bank of Canada connector definition + publish |
| `setupDestinationWithReport(dataMartId)` | `{ destinationId, reportId }` | Creates a Looker Studio destination and links a report to a DataMart |

### Usage in `beforeAll`

`beforeAll` does not receive the `apiHelpers` fixture (Playwright limitation -- `beforeAll` only gets `{ browser }`). Instantiate manually:

```typescript
import { ApiHelpers } from '../fixtures/api-helpers';

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const api = new ApiHelpers(page);

  const storage = await api.createStorage();
  const dm = await api.createDataMart(storage.id, 'My DataMart');

  await page.close();
});
```

## RadixHelpers

Located in `helpers/radix.ts`. Handles Radix UI component interactions that involve portals (content rendered outside the component tree) and animations.

| Method | Description |
|--------|-------------|
| `selectOption(trigger, optionText)` | Click a Radix Select trigger, wait for listbox portal, click option |
| `selectComboboxOption(trigger, optionText, searchText?)` | Click a cmdk Combobox trigger, optionally search, click option |
| `dismissSheet(sheetContent)` | Press Escape to close a Sheet, wait for animation |
| `dismissDialog(dialogContent)` | Press Escape to close a Dialog, wait for animation |
| `confirmDialog(confirmLabel?)` | Click confirm button in a ConfirmationDialog (default label: "Confirm") |

```typescript
test('example with radix', async ({ page, radix }) => {
  const trigger = page.getByRole('combobox');
  await radix.selectComboboxOption(trigger, 'Google BigQuery');

  const sheet = page.getByTestId('storageConfigSheet');
  await radix.dismissSheet(sheet);
});
```

## Credential Gating

Located in `helpers/credentials.ts`. Use `describeIfCredentials` to skip entire test suites when required environment variables are missing:

```typescript
import { describeIfCredentials } from '../helpers/credentials';

describeIfCredentials(['GCP_PROJECT_ID', 'GCP_CREDENTIALS'], 'Cloud Storage Tests', () => {
  test('connects to real GCP', async ({ page }) => {
    // Only runs when GCP_PROJECT_ID and GCP_CREDENTIALS are set
  });
});
```

When env vars are missing, the suite shows as skipped in the test reporter with a message listing the missing variables.

## TESTIDS

Located in `selectors/testids.ts`. Centralized `as const` object with all `data-testid` values used across specs. Grouped by domain:

| Domain | IDs | Count |
|--------|-----|-------|
| Storage | `storageListPage`, `storageTypeDialog`, `storageTable`, `storageConfigSheet`, `storageEditForm`, `storageDeleteButton` | 6 |
| DataMart | `datamartList`, `datamartTable`, `datamartCreateForm`, `datamartCreatePage`, `datamartDetails`, `datamartTabNav`, `datamartTabOverview`, `datamartTabDataSetup`, `datamartPublishButton`, `datamartDeleteButton`, `datamartTitleInput`, `datamartSearchInput`, `datamartStatusFilter` | 13 |
| Destination | `destTab`, `destEmptyState`, `destCreateButton`, `destEditSheet`, `destCard` | 5 |
| Report | `reportCreateButton`, `reportEditSheet`, `reportCard` | 3 |
| Trigger | `triggerTab`, `triggerEmptyState`, `triggerCreateButton`, `triggerEditSheet`, `triggerTable`, `triggerToggle` | 6 |
| Run History | `runHistoryTab`, `runHistoryTable`, `runHistoryEmptyState`, `runLogView` | 4 |
| Notifications | `notifPage`, `notifSettingsTable`, `notifToggle`, `notifEditSheet` | 4 |

Import and use in specs:

```typescript
import { TESTIDS } from '../selectors/testids';

await page.getByTestId(TESTIDS.storageListPage);
```

## Test Files

### `specs/storage.spec.ts` -- Storage Type Creation, Config, Validation, Delete

Tests the DataStorage creation flow, config sheet, form validation, and deletion.

**Storage Type Creation (5 tests):**
Creates each of the 5 active storage types (Google BigQuery, AWS Redshift, Snowflake, Databricks, AWS Athena) via the UI. Each test navigates to `/ui/0/data-storages`, clicks "New Storage", selects the type in the dialog, verifies the config sheet opens, dismisses it, and checks the storage table shows the new entry.

**Storage Config Sheet (1 test):**
Opens a storage's config sheet via the 3-dot row menu "Edit" action. Verifies the sheet and edit form are visible, then dismisses via the Cancel button.

**Storage Validation (5 parameterized tests):**
For each of the 5 storage types, opens the config sheet, clears the Title field, clicks Save, and verifies a validation error (`[data-slot="form-message"]`) appears.

**BigQuery Config Save (credential-gated, 1 test):**
Requires `BIGQUERY_PROJECT_ID` and `BIGQUERY_CREDENTIALS_JSON`. Fills BigQuery-specific fields (Project ID, Credentials JSON) and saves. Verifies sheet closes on success.

**Athena Config Save (credential-gated, 1 test):**
Requires `AWS_ACCESS_KEY_ID` and `AWS_REGION`. Fills the Region field and saves. Verifies sheet closes on success.

**Storage Delete (1 test):**
Deletes a storage via the 3-dot menu with confirmation dialog. Verifies the pagination row count decreases by one.

### `specs/datamart-create.spec.ts` -- DataMart Creation Form

Tests the DataMart creation form with prerequisite storage setup via API.

**`beforeEach`:** Creates a storage via `apiHelpers.createStorage()` to ensure the form's storage dropdown has an option.

**Test 1: Create a DataMart through the UI form**
Navigate to `/ui/0/data-marts/create`, fill title, select storage, submit. Verify redirect to `/data-marts/<id>/data-setup`.

**Test 2: Shows validation errors on empty form submission**
Clear the title field, click submit. Verify page stays on `/data-marts/create` (no redirect = validation blocked).

### `specs/datamart-list.spec.ts` -- DataMart List Operations

Tests empty state, table rendering, search, status filter, row navigation, and delete.

**Empty State (1 test):**
Deletes all existing datamarts via API, navigates to `/ui/0/data-marts`, verifies the empty state heading "Build Your First" is visible.

**Table + Search + Filter + Navigation (4 tests):**
`beforeAll` seeds a draft and a published datamart. Tests verify:

- Both datamarts appear in the table
- Search filters by title (typing draft title hides published, clearing restores both)
- Status filter (select "Status" field, pick "Draft", apply) shows only draft datamarts
- Clicking a row navigates to the detail page (`/data-marts/<id>/data-setup`)

**Delete (1 test):**
Creates a datamart, deletes it via the row's 3-dot menu with confirmation dialog, verifies it disappears from the table.

### `specs/datamart-detail.spec.ts` -- DataMart Detail Page

Tests inline title editing, deletion from detail page, manual run, status badge, and publish flow.

**Title Edit (1 test):**
Edits the title inline via the textarea input, presses Enter, verifies the new value in the UI and via API GET.

**Delete (1 test):**
Deletes a datamart from the detail page via the 3-dot menu, confirms the dialog, verifies redirect to the list page and absence of the deleted entry.

**Manual Run (2 tests):**

- Triggers manual run on a connector-type published DM via the 3-dot menu "Manual Run..." item, clicks Run in the ConnectorRunSheet, navigates to Run History to verify an entry appeared.
- Negative case: verifies "Manual Run..." is absent from the menu for SQL-type published DMs.

**Status Badge (2 tests):**
Verifies draft DMs show "Draft" badge and the publish button, while published DMs show "Published" badge with no publish button.

**Publish Flow (credential-gated, 1 test):**
Requires `BIGQUERY_PROJECT_ID` and `BIGQUERY_CREDENTIALS_JSON`. Full UI flow: selects SQL definition type, types SQL in Monaco editor, saves, navigates to overview, clicks Publish, verifies "Published" status.

### `specs/datamart-data-setup.spec.ts` -- DataMart Data Setup

Tests the Data Setup tab: storage card, output schema, SQL definition, and connector wizard.

**Storage Card + Output Schema (2 tests):**
Verifies the Storage section shows "Google BigQuery" for the assigned storage, and the Output Schema section renders.

**SQL Definition (3 tests):**

- Selects SQL type via definition type selector, verifies Monaco editor renders.
- Types SQL in Monaco via keyboard, clicks Save, verifies persistence via API and editor content.
- Sets definition via API, reloads, verifies Monaco shows the persisted SQL text.

**Connector Definition (2 tests):**

- Selects Connector type, verifies wizard auto-opens at "Step 1 of 5" with "Bank of Canada" available.
- Completes the full 5-step Bank of Canada wizard (choose connector, configure settings, select node, select fields, set target), saves, verifies "BankOfCanada" text on the page, reloads to verify persistence, and confirms via API.

### `specs/datamart-tabs.spec.ts` -- Tab Navigation + Console Error Detection

Tests that all DataMart detail tabs render correctly and produce no JavaScript errors.

**`beforeAll`:** Creates a DataMart via `ApiHelpers` (manual instantiation with `browser.newPage()`).

#### Single test: All 5 visible tabs render without console errors

| Tab Name | URL Path | Content Verification |
|----------|----------|---------------------|
| Overview | `/overview` | `datamartTabOverview` testid visible |
| Data Setup | `/data-setup` | `datamartTabDataSetup` testid visible |
| Destinations | `/reports` | `datamartDetails` container visible |
| Triggers | `/triggers` | `datamartDetails` container visible |
| Run History | `/run-history` | `datamartDetails` container visible |

Console errors are collected and filtered (Intercom, GTM, analytics, network errors, React DOM warnings). After all tabs, asserts zero unfiltered errors.

### `specs/destination.spec.ts` -- Destination CRUD

Tests empty state and CRUD operations for each destination type.

**Empty State (1 test):**
Cleans up all existing reports and destinations via API, creates a fresh DM, navigates to the Destinations tab (`/reports`), verifies "Go to Destinations" link is visible.

**Parameterized CRUD (4 types x 3 tests = 12 tests):**
For each of Looker Studio, Email, Microsoft Teams, and Google Chat:

- Renders destination card on the DM's Destinations tab
- Edits destination title via the edit sheet on the standalone `/data-destinations` page
- Deletes destination via the 3-dot row menu with confirmation

**Google Sheets (credential-gated, 3 tests):**
Requires `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`. Creates a Google Sheets destination via UI. Edit and delete tests are skipped (TODO).

### `specs/report.spec.ts` -- Report Operations

Tests report creation, editing, deletion, listing, and fire-and-forget runs for both Looker Studio (card/toggle pattern) and Email (table pattern).

**Looker Studio Pattern (3 tests):**

- Creates report by toggling the SwitchItemCard on (verifies "Available in Looker Studio")
- Edits report cache lifetime via the edit sheet (changes combobox to "4 hours")
- Deletes report by toggling the card off (verifies "Not available in Looker Studio")

**Email Pattern (3 tests):**

- Creates report via the "Add Report" button, fills title/subject/message in the sheet, saves using the "Create new report" dropdown action
- Edits report subject via the edit sheet
- Deletes report via the row's actions dropdown with confirmation dialog

**List Rendering (1 test):**
Creates 2 email reports via API, navigates to the Destinations tab, verifies both titles are visible and the table has exactly 2 rows.

**Fire-and-Forget Run (1 test):**
Creates an email report, triggers a run via the row's Run button, waits for the API 201 response, navigates to Run History, verifies a run entry appeared.

### `specs/trigger.spec.ts` -- Scheduled Triggers

Tests trigger empty state, creation, editing, toggling, deletion, and validation.

**Empty State (1 test):**
Creates a published connector DM, navigates to `/triggers`, verifies "No scheduled triggers yet" message and `triggerEmptyState` testid.

**CONNECTOR_RUN Type (4 tests):**

- Creates a CONNECTOR_RUN trigger via UI: opens sheet, selects "Connector Run" type, clicks "Create trigger", verifies it appears in the table.
- Shows trigger in list with schedule info after API-created trigger.
- Edits trigger schedule: opens edit sheet by clicking the row, changes schedule type to "Weekly", saves.
- Deletes trigger via row action menu with confirmation, verifies empty state reappears.

**REPORT_RUN Type (1 test):**
Creates an email destination + report, then creates a REPORT_RUN trigger selecting the report from the dropdown.

**Toggle Enabled/Disabled (1 test):**
Creates a trigger (enabled by default), opens edit sheet, toggles the `#schedule-enabled` switch from `aria-checked=true` to `false`, saves, verifies "Disabled" status in the table, reloads to verify persistence.

**Validation (1 test):**
Selects "Report Run" type without selecting a report, clicks "Create trigger", verifies a validation error (`[data-slot="form-message"]`) appears.

### `specs/run-history.spec.ts` -- Run History

Tests empty state, run entries, status badges, timestamps, and log views.

**Empty State (1 test):**
Creates a published connector DM with no runs, navigates to `/run-history`, verifies "No runs found for this Data Mart" and `runHistoryEmptyState` testid.

**After Manual Run (4 tests):**
Each test triggers a manual run via the `triggerManualRun` helper (overview page 3-dot menu -> "Manual Run..." -> sheet Run button -> wait for 201 response).

- Verifies at least one run entry (`.dm-card-block`) appears in the run history container.
- Verifies a status badge (`Running|Success|Pending|Failed`) is visible, then waits for terminal status (`Success` or `Failed`, 60s timeout).
- Verifies a timestamp element (`.font-mono`) containing digits is visible.
- Expands a completed run entry, verifies `runLogView` testid, checks "Run ID:" heading, then switches between Structured (default), Raw, and Configuration log views.

### `specs/notifications.spec.ts` -- Notification Settings

Tests the notification settings page rendering, toggle interaction, and edit sheet.

**Test 1: Page renders with notification settings table**
Navigates to `/ui/0/notifications`, verifies the page container (`notifPage`), "Notification settings" heading, and settings table (`notifSettingsTable`).

**Test 2: Toggle notification enabled/disabled**
Clicks the first toggle switch, verifies `aria-checked` flips (server-driven, not optimistic).

**Test 3: Edit notification settings via sheet**
Clicks the first table row (avoiding the switch), verifies the edit sheet (`notifEditSheet`) opens.

### `specs/lifecycle.spec.ts` -- Full End-to-End Lifecycle

The most comprehensive single test -- covers the complete journey from storage creation to publishing.

**Single test: create storage -> create datamart -> set definition -> publish -> verify:**

1. **Create Storage (API):** `apiHelpers.createStorage()`
2. **Create DataMart (UI):** Fill form, select storage, submit
3. **Set Definition (API):** `apiHelpers.setDefinition(datamartId)`
4. **Publish (API):** `apiHelpers.publish(datamartId)`
5. **Verify (UI):** Reload, navigate to Overview, verify "Published" status visible and Publish button hidden

Steps 1, 3, 4 use `apiHelpers` because they require cloud credentials (projectId + location) that are not available in test mode. Step 2 tests the actual UI form.

### `specs/oauth-skeletons.spec.ts` -- OAuth Connector Skeletons

Placeholder test suites for OAuth-dependent features. All tests are unconditionally skipped with explanatory messages.

- **Google Sheets OAuth:** Requires `GOOGLE_SHEETS_REFRESH_TOKEN`. Steps: create destination, trigger OAuth flow, verify connected status.
- **Microsoft / TikTok OAuth:** Requires `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `TIKTOK_ACCESS_TOKEN`. Steps: create destination, trigger OAuth, verify card.
- **OAuth-requiring Connectors:** Requires connector-specific OAuth credentials. Steps: select connector, trigger OAuth, verify connected, save definition.

## Conventions

### data-testid Naming

- **Format:** `camelCase` with domain prefix (e.g., `storage*`, `datamart*`, `dest*`, `report*`, `trigger*`, `run*`, `notif*`)
- **Placement:** Only in `apps/web` components. Never in `packages/ui` shared components.
- **Philosophy:** Minimal and incremental -- only add testids for elements that tests actually target
- **Constant:** All testids are defined in `selectors/testids.ts`

### Selector Strategy (in priority order)

1. **`getByTestId`** -- for page containers, sections, regions (`page.getByTestId(TESTIDS.storageListPage)`)
2. **`getByRole`** -- for interactive elements: `page.getByRole('button', { name: 'New Storage' })`, `page.getByRole('combobox')`, `page.getByRole('option').first()`
3. **`getByText`** -- for verifying visible text content (`page.getByText('Published')`)
4. **`getByPlaceholder`** -- for form inputs with placeholder text (`page.getByPlaceholder('Enter title')`)

### Scoping to Avoid Ambiguity

When the same text appears in multiple places (e.g., "Overview" in both sidebar and tabs), scope the selector:

```typescript
// BAD: Matches sidebar AND tab nav
await page.getByRole('link', { name: 'Overview' }).click();

// GOOD: Scoped to tab navigation
const tabNav = page.getByTestId(TESTIDS.datamartTabNav);
await tabNav.getByRole('link', { name: 'Overview', exact: true }).click();
```

## Writing New Specs

Checklist for adding a new spec file:

1. **Create file in `e2e/specs/`** -- all spec files live in this directory
2. **Import from fixtures** -- use `../fixtures/base`, not `@playwright/test`
3. **Use `apiHelpers` for test data setup** -- avoid creating prerequisite data through UI clicks
4. **Use `radix` for Radix UI component interactions** -- handles portals and animations
5. **Use `TESTIDS` for selectors** -- import from `../selectors/testids`
6. **Add `data-testid` attributes** to React components in `apps/web/src/` as needed, and add entries to `selectors/testids.ts`
7. **Use `describeIfCredentials`** if your test requires cloud credentials
8. **Run your spec:** `npx playwright test e2e/specs/your-feature.spec.ts`
9. **Debug failures:** `npx playwright test e2e/specs/your-feature.spec.ts --ui`

Examples:

```typescript
// Import from fixtures (step 2)
import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';
import { describeIfCredentials } from '../helpers/credentials';

// Use apiHelpers for setup (step 3)
test.beforeEach(async ({ apiHelpers }) => {
  await apiHelpers.createStorage();
});

// Use radix for Radix UI interactions (step 4)
test('example', async ({ page, radix }) => {
  await radix.selectOption(trigger, 'Option Text');
  await page.getByTestId(TESTIDS.storageListPage);
});

// Credential-gated suites (step 7)
describeIfCredentials(['GCP_PROJECT_ID'], 'GCP Tests', () => { /* ... */ });
```

## Troubleshooting

**"Cannot find module" or backend won't start:**
Build the backend first: `npm run build -w @owox/backend`

**"Port 3000 is already in use":**
Stop your dev server before running e2e tests: `kill $(lsof -ti:3000)` (and/or `:5173`). Playwright must start its own servers to use the correct test environment.

**Tests hang on server startup:**
Check that ports 3000 and 5173 are free. Kill any existing processes on those ports.

**Flaky timeouts in CI:**
Increase the `timeout` in individual test steps or `playwright.config.ts`. Browser startup in CI is slower than local.

**"net::ERR_CERT_AUTHORITY_INVALID":**
The Vite dev server uses self-signed certs. `ignoreHTTPSErrors: true` is set in config. If you see this in test output, it's filtered by the console error detection and won't fail tests.

**Can't find an element:**
Use Playwright's codegen to discover selectors: `npx playwright codegen https://localhost:5173`
