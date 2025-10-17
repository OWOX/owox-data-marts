# Creating a New Integration

To create an integration with a new data source, follow these steps:

## 1. Create Connector Directory

Create a new directory in `src/Sources/` with your data source name:

```bash
mkdir -p packages/connectors/src/Sources/YourDataSource
```

## 2. Create Required Files

Every connector must have these three files:

### `manifest.json`

```json
{
  "title": "Your Data Source"
}
```

Optional fields:

- `logo` — path to logo file (SVG/PNG), will be auto-converted to base64

### `Source.js`

The Source class handles data fetching from the API:

```javascript
/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var YourDataSourceSource = class YourDataSourceSource extends AbstractSource {

  constructor(config) {
    super(config.mergeParameters({
      AccessToken: {
        isRequired: true,
        requiredType: "string",
        label: "Access Token",
        description: "API Access Token for authentication",
        attributes: [CONFIG_ATTRIBUTES.SECRET]
      },
      StartDate: {
        requiredType: "date",
        label: "Start Date",
        description: "Start date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL]
      },
      EndDate: {
        requiredType: "date",
        label: "End Date",
        description: "End date for data import",
        attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM]
      },
      MaxFetchingDays: {
        requiredType: "number",
        isRequired: true,
        default: 31,
        label: "Max Fetching Days",
        description: "Maximum number of days to fetch in one run"
      },
      ReimportLookbackWindow: {
        requiredType: "number",
        isRequired: true,
        default: 2,
        label: "Reimport Lookback Window",
        description: "Number of days to look back when reimporting data"
      }
    }));
  }

  /**
   * Fetch data from the data source
   * @param {Date} startDate - Start date for data range
   * @param {Date} endDate - End date for data range
   * @return {Array} Array of data objects
   */
  fetchData(startDate, endDate) {
    let data = [];

    // Format dates for API
    const formattedStartDate = EnvironmentAdapter.formatDate(startDate, "UTC", "yyyy-MM-dd");
    const formattedEndDate = EnvironmentAdapter.formatDate(endDate, "UTC", "yyyy-MM-dd");

    // Build API URL
    const url = `https://api.example.com/data?start=${formattedStartDate}&end=${formattedEndDate}`;

    // Fetch data with automatic retry on transient errors
    const response = this.urlFetchWithRetry(url, {
      headers: {
        'Authorization': `Bearer ${this.config.AccessToken.value}`
      }
    });

    // Parse response
    const jsonData = JSON.parse(response.getContentText());
    data = jsonData.data || [];

    console.log(`Fetched ${data.length} records`);
    return data;
  }

  /**
   * Determines if an error should trigger a retry
   * @param {HttpRequestException} error - The error to check
   * @return {boolean} True if should retry
   */
  isValidToRetry(error) {
    // Retry on server errors (5xx)
    if (error.statusCode && error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN) {
      return true;
    }

    // Add data source-specific retry logic here
    // For example, check for rate limiting errors

    return false;
  }
}
```

### `Connector.js`

The Connector class orchestrates the data transfer:

```javascript
/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var YourDataSourceConnector = class YourDataSourceConnector extends AbstractConnector {

  // Add connector-specific methods here if needed
  // Most functionality is inherited from AbstractConnector

}
```

## 3. Configuration Parameters

Configuration parameters are defined in the Source constructor using `config.mergeParameters()`. Common parameters:

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

**Standard Parameters (recommended):**

- `StartDate` — start date for initial import
- `EndDate` — end date for backfill operations
- `MaxFetchingDays` — maximum days per import run
- `ReimportLookbackWindow` — days to reimport for data consistency
- `CreateEmptyTables` — whether to create tables with no data

## 4. Advanced Features

### Paginated Data Fetching

For APIs with pagination:

```javascript
fetchData(startDate, endDate) {
  let allData = [];
  let nextPageUrl = this._buildInitialUrl(startDate, endDate);

  while (nextPageUrl) {
    const response = this.urlFetchWithRetry(nextPageUrl);
    const jsonData = JSON.parse(response.getContentText());

    allData = allData.concat(jsonData.data);
    nextPageUrl = jsonData.next_page_url || null;
  }

  return allData;
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

For connectors with multiple endpoints or field selections:

```javascript
constructor(config) {
  super(config.mergeParameters({ /* ... */ }));

  this.fieldsSchema = {
    'endpoint-name': {
      name: 'Endpoint Name',
      description: 'Description of this endpoint',
      fields: {
        field1: {
          name: 'Field 1',
          description: 'Field description',
          type: 'string'
        },
        field2: {
          name: 'Field 2',
          type: 'numeric string'
        }
      },
      limit: 100 // optional: pagination limit
    }
  };
}
```

## 5. Testing Your Connector

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
   - Create new data mart with new connector
   - Create a configuration with required parameters
   - Test connector with existing storage

## 6. Optional Files

You can add additional files to your connector directory:

- `FieldsSchema.js` — separate file for complex field schemas
- `Constants.js` — connector-specific constants
- `CREDENTIALS.md` — instructions for obtaining API credentials
- `GETTING_STARTED.md` — setup guide for users
- `README.md` — connector documentation
- `logo.svg` — connector logo (referenced in manifest.json)

All `.js` files (except `*.gs`) in your connector directory will be automatically bundled.
