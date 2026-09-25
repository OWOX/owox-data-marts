# Creating a New Source

To create a new source with a new data source, follow these steps:

## 1. Create Connector Directory

Create a new directory in `src/Sources/` with your data source name:

```bash
mkdir -p packages/connectors/src/Sources/YourDataSource
```

## 2. Pick a connector kind

There are two, and they are discovered differently at build time:

- **JavaScript connector** — a `Source.js` class plus a small `manifest.json` carrying only
  catalog metadata. Choose this when the API needs logic the declarative grammar cannot express.
- **Declarative connector** — a single `manifest.json` that describes the whole connector and no
  `Source.js` at all. Choose this whenever the grammar covers the API; there is less to write and
  nothing to maintain.

The build decides by looking at the directory: a `manifest.json` with a `nodes` key and no
`Source.js` is declarative. A directory that is neither fails the build by name, so a half-created
connector cannot silently disappear from the bundle.

The rest of this guide covers the JavaScript kind. For the declarative kind, see
[Declarative Connectors](#9-declarative-connectors) below.

## 3. Create Required Files (JavaScript connector)

A JavaScript connector is a `manifest.json` and a `Source.js`, usually with its fields schema in
files of its own. There is no connector class to write: one engine, `AbstractConnector`
(`src/Core/AbstractConnector.js`), runs every source. It validates the configuration, works out
the dates to import, calls `fetchData` for every node, account and date, writes what comes back
to the storage and records how far the import got.

### `manifest.json`

```json
{
  "title": "Your Data Source"
}
```

Optional fields:

- `logo` — path to logo file (SVG/PNG), will be auto-converted to base64
- `docUrl` — link to the connector's documentation

### `Source.js`

The Source class declares the connector's parameters and fetches its data:

```javascript
/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../../Core/AbstractSource.js';

export class YourDataSourceSource extends AbstractSource {
  constructor(context) {
    super(context);

    this.parameters = {
      AccessToken: {
        isRequired: true,
        requiredType: 'string',
        label: 'Access Token',
        description: 'API Access Token for authentication',
        attributes: [CONFIG_ATTRIBUTES.SECRET],
      },
      StartDate: {
        requiredType: 'date',
        label: 'Start Date',
        description: 'Start date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      EndDate: {
        requiredType: 'date',
        label: 'End Date',
        description: 'End date for data import',
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      ReimportLookbackWindow: {
        requiredType: 'number',
        isRequired: true,
        default: 2,
        label: 'Reimport Lookback Window',
        description: 'Number of days to look back when reimporting data',
      },
      Fields: {
        isRequired: true,
        requiredType: 'string',
        label: 'Fields',
        description: 'Fields to import',
      },
    };

    this._registerParameters();

    this.fieldsSchema = YourDataSourceFieldsSchema;
  }

  /**
   * Returns the rows of one node for one account and one date window.
   * @param {Object} request
   * @param {string} request.nodeName - A key of this.fieldsSchema
   * @param {Array<string>} request.fields - The fields selected for that node
   * @param {string|null} request.accountId - null unless getAccounts() returns accounts
   * @param {string|null} request.startDate - YYYY-MM-DD; null for a node that is not a time series
   * @param {string|null} request.endDate - YYYY-MM-DD; the same day as startDate unless
   *   getDateStrategy() returns DATE_STRATEGY.RANGE
   * @return {Promise<Array<Object>>} The rows
   */
  async fetchData({ nodeName, fields, startDate, endDate }) {
    const url = `https://api.example.com/${nodeName}?start=${startDate}&end=${endDate}`;
    const response = await this.urlFetchWithRetry(url, {
      headers: { Authorization: `Bearer ${this.context.getParameter('AccessToken')?.value}` },
    });
    const body = await response.json();

    this.context.log(LOG_LEVEL.INFO, `Fetched ${body.data.length} rows of ${nodeName}`);
    return body.data;
  }

  /**
   * Determines if a failed request should be sent again. The default retries nothing.
   * @param {Error} error - The error, with statusCode when the server answered
   * @return {boolean} True if should retry
   */
  isValidToRetry(error) {
    return (
      !error.statusCode ||
      error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN ||
      error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS
    );
  }
}
```

The core classes and constants (`CONFIG_ATTRIBUTES`, `LOG_LEVEL`, `HTTP_STATUS`, `DATE_STRATEGY`,
`DATA_TYPES`, the utility classes) and every `.js` file in the connector's own directory are in
scope in the bundle, so only `AbstractSource` is imported.

### What the engine asks of a source

Besides `fetchData`, a source can override:

- `getAccounts(context)` — the accounts to import, as objects with an `id`. The default is a
  single run with `accountId: null`.
- `getDateStrategy(nodeName)` — how a time-series node's dates are requested:
  `DATE_STRATEGY.DAY_BY_DAY` (the default, one call per day), `DATE_STRATEGY.RANGE` (one call for
  the whole window) or `DATE_STRATEGY.NONE`.
- `onAccountComplete(account)`, `onAccountError(account, error)` and `onImportComplete(context)` —
  called after an account's nodes are done, when an account fails, and at the end of the run.

The engine imports catalog nodes first, then time-series nodes one date at a time for every
account and node, and records each finished date, so an interrupted run resumes where it
stopped. Every account is attempted: one the API refuses with a 401 or 403 is skipped with a
warning, and any other failure fails the run once the remaining accounts have had their turn.

## 4. Configuration Parameters

Configuration parameters are declared in the Source constructor as `this.parameters` and registered with `this._registerParameters()`. Every source also gets `MaxFetchRetries` and `InitialRetryDelay` under Advanced Settings. Common parameters:

**Required Config Attributes:**

- `isRequired: true` — parameter must have a value
- `requiredType` — data type validation: "string", "number", "date", "boolean"
- `default` — default value if not provided
- `label` — human-readable label for UI
- `description` — detailed description for documentation

**Special Attributes:**

- `CONFIG_ATTRIBUTES.SECRET` — marks sensitive data (passwords, tokens)
- `CONFIG_ATTRIBUTES.MANUAL_BACKFILL` — parameter can be overridden during manual backfill
- `CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM` — hidden from config UI
- `CONFIG_ATTRIBUTES.ADVANCED` — shown under Advanced Settings in the config UI
- `CONFIG_ATTRIBUTES.DYNAMIC_OPTIONS` — allowed values are loaded from the source while the
  form is being filled. The source implements `fetchFieldOptions(fieldName, signal)` and
  returns `[{ value, label }]`; list the parameters the lookup needs in `optionsDependsOn`.
  The lookup runs before the configuration is validated, so it must not rely on defaults
  or on other parameters being present.

**Standard Parameters (recommended):**

- `StartDate` — start date for initial import
- `EndDate` — end date for backfill operations
- `ReimportLookbackWindow` — days to reimport for data consistency
- `CreateEmptyTables` — whether to create tables with no data

## 5. Utility Classes

The framework provides several utility classes for common operations. HTTP requests go through
the source's own `urlFetchWithRetry(url, options)`, which returns a native `Response`.

### DateUtils

```javascript
// YYYY-MM-DD, in UTC
const formatted = DateUtils.formatDate(new Date());

// A Date from an ISO string or a Unix timestamp, or null
const date = DateUtils.parseDate('2026-01-15');
```

### AsyncUtils

```javascript
// Wait 1 second
await AsyncUtils.delay(1000);
```

### CryptoUtils

```javascript
// Generate UUID
const id = CryptoUtils.getUuid();

// Base64 encode
const encoded = CryptoUtils.base64Encode('data');

// Compute HMAC signature
const signature = CryptoUtils.computeHmacSignature(
  CryptoUtils.MacAlgorithm.HMAC_SHA_256,
  'data',
  'secret'
);
```

### FileUtils

```javascript
// Parse CSV
const data = FileUtils.parseCsv('col1,col2\nval1,val2');

// Unzip data
const files = FileUtils.unzip(zipBuffer);
```

## 6. Advanced Features

### Paginated Data Fetching

For APIs with pagination, collect every page inside `fetchData`:

```javascript
async fetchData({ nodeName, startDate, endDate }) {
  let rows = [];
  let nextPageUrl = this._buildInitialUrl(nodeName, startDate, endDate);

  while (nextPageUrl) {
    const response = await this.urlFetchWithRetry(nextPageUrl);
    const body = await response.json();

    rows = rows.concat(body.data);
    nextPageUrl = body.next_page_url || null;
  }

  return rows;
}
```

### Custom Retry Logic

Override `isValidToRetry()` to implement data source-specific retry logic:

```javascript
isValidToRetry(error) {
  // Always retry server errors
  if (error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
    return true;
  }

  // Check for rate limiting
  if (error.statusCode === 429) {
    return true;
  }

  // Check for specific error codes in payload
  if (error.payload?.error_code === 'TEMPORARY_ERROR') {
    return true;
  }

  return false;
}
```

The retry mechanism uses exponential backoff with jitter, configured via:

- `MaxFetchRetries` (default: 3)
- `InitialRetryDelay` (default: 5000ms)

### Fields Schema

`fieldsSchema` lists the connector's nodes. Each node names its fields, the fields that identify
a row and the table it is written to:

```javascript
var YourDataSourceFieldsSchema = {
  campaigns: {
    overview: 'Campaigns',
    description: 'Campaign statistics by day.',
    documentation: 'https://api.example.com/docs/campaigns',
    fields: {
      date: { description: 'The day of the statistics.', type: DATA_TYPES.DATE },
      campaign_id: { description: 'The campaign.', type: DATA_TYPES.STRING },
      clicks: { description: 'Clicks on the day.', type: DATA_TYPES.INTEGER },
    },
    uniqueKeys: ['date', 'campaign_id'],
    defaultFields: ['date', 'campaign_id', 'clicks'],
    destinationName: 'your_data_source_campaigns',
    isTimeSeries: true,
  },
};
```

A node with `isTimeSeries: true` is fetched per date; any other node is a catalog, fetched once
per account.

### Partitioning in Google BigQuery

Mark one date-like field per node with `GoogleBigQueryPartitioned: true`:

```javascript
date: {
  description: 'The date for this metric.',
  type: DATA_TYPES.DATE,
  GoogleBigQueryPartitioned: true
}
```

The flag has two effects:

- New destination tables get `PARTITION BY` on this field.
- Incremental MERGE runs add a date-range filter on the target table.
  BigQuery then scans only the partitions being written, not the full table.

Two rules make the filter work:

- The field type must be `DATE`, `DATETIME`, or `TIMESTAMP`. `DATETIME`
  and `TIMESTAMP` fields get daily partitions via `_TRUNC`. Any other type
  skips partitioning: the table is created unpartitioned and the run log
  records the skipped column.
- The node's `uniqueKeys` must include the field. Without it, the MERGE
  skips the filter and scans the whole table on every run.

Flag exactly one field per node. When several fields carry the flag, the
last one selected for the table wins. Time-series nodes should set both
the flag and the `uniqueKeys` entry. Entity nodes without a date field
need neither.

## 7. Testing Your Connector

After creating your connector:

1. **Build the package:**

   ```bash
   npm run build
   ```

2. **Check the build output:**
   - Your connector should appear in `dist/index.js`
   - Verify it's listed in `AvailableConnectors`

3. **Test integration:**
   - Run backend application with `npm run dev -w owox`
   - Move to OWOX Data Marts application in your browser: `http://localhost:3000`
   - Create new data mart with new source connector
   - Create a configuration with required parameters
   - Test source with existing storage

## 8. Optional Files

You can add additional files to your connector directory:

- `FieldsSchema.js` — separate file for complex field schemas
- `Constants.js` — connector-specific constants
- `CREDENTIALS.md` — instructions for obtaining API credentials
- `GETTING_STARTED.md` — setup guide for users
- `README.md` — connector documentation
- `logo.svg` — connector logo (referenced in manifest.json)

All `.js` files in your connector directory will be automatically bundled.

## 9. Declarative Connectors

A declarative connector is a single `manifest.json` and nothing else — no `Source.js`, no
JavaScript at all. The declarative engine reads the manifest and performs the requests,
pagination, incremental windows, filtering and type casting described in it.

`src/Sources/RatesDeclarative/` is the shipped example: one file, under a kilobyte.

### What the file contains

The declarative manifest carries the connector's whole definition, plus the same catalog
metadata a JavaScript connector's `manifest.json` carries:

```json
{
  "title": "Frankfurter FX (Declarative)",
  "docUrl": "https://frankfurter.dev",
  "version": "1.0",
  "name": "RatesDeclarative",
  "baseUrl": "https://api.frankfurter.dev",
  "parameters": {
    "Base": { "requiredType": "string", "isRequired": true, "default": "EUR" }
  },
  "nodes": {
    "latest": {
      "uniqueKeys": ["date", "base"],
      "fields": { "date": { "type": "date" }, "base": { "type": "string" } },
      "request": { "method": "GET", "path": "/v1/latest" },
      "recordSelector": { "recordPath": [] }
    }
  }
}
```

`name` must match the directory name. `logo` works exactly as it does for a JavaScript
connector — point it at a `logo.svg` beside the manifest and the build inlines it.

The full grammar — six authentication types, four pagination types, incremental strategies,
partition routers, async retrievers, transformations, record filters and error handling — lives in
the [manifest reference](../../docs/connectors/manifest-reference.md). The same grammar written for
AI assistants is `docs/connectors/manifest-reference.llms.txt`.

### Two things to do besides writing the file

1. **Add the name to `ALL_CONNECTORS`** in `packages/test-utils/src/constants.ts`. The backend
   e2e suite asserts the length of the bundled connector list, so a new connector without this
   entry fails `connector-list.e2e-spec.ts` with a count mismatch rather than a useful message.
2. **Check the name is not already taken by a customer.** Bundled names are reserved
   (`RESERVED_NAMES` in `connector-definition.service.ts`), and connector lookup resolves bundled
   names before project-level custom ones. A custom connector that already carries the name was
   created before the guard existed for it, so shipping a bundled connector under that name
   shadows theirs on upgrade.

### How it is validated

The build parses every bundled declarative manifest with the same `ManifestParser` the runtime
uses, and fails by name if it does not parse. This catches missing or misnamed required keys,
malformed authentication blocks, a `recordPath` given as a string instead of an array, and a
`pagination` or `incremental` block that could not work at run time. It does not catch every
shape error — a request path missing its leading `/` still gets through — so run the connector
once before shipping it.
