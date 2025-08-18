# NodeJS Runner for Connectors

A Node.js utility for running OWOX Data Marts connectors in isolated environments.

The NodeJS connector runner allows you to execute data connectors on your machine in isolated Node.js environments. This is particularly useful for development, testing, debugging, and production runs of data integration connectors.

## Key Features

- **Isolated Environment Creation**: Creates separate Node.js environments for each connector run
- **Automatic Dependency Management**: Installs required dependencies for each connector
- **Configuration Validation**: Validates connector and storage configurations
- **Run Configuration Support**: Supports different run types (INCREMENTAL, MANUAL_BACKFILL, FULL_REFRESH)
- **Storage Support**: Supports multiple storage backends (Google BigQuery, AWS Athena)
- **Resource Cleanup**: Automatically cleans up temporary files and dependencies after execution
- **Environment Variable Management**: Passes configuration and run context via environment variables

## Installation

```bash
# From the root directory of the repository
npm install
```

## Usage

### Basic Usage

To run a connector:

```bash
npm run connector-runner-node -- path/to/connector-config.json
```

### Programmatic Usage

```javascript
const { ConnectorRunner, Config, RunConfig } = require('@owox/connector-runner');

const runner = new ConnectorRunner();
const datamartId = 'my-datamart';
const runId = 'run-' + Date.now();

// Create configuration
const config = new Config({
  name: 'TikTokAdsConnector',
  source: {
    name: 'TikTokAds',
    config: {
      // source configuration
    }
  },
  storage: {
    name: 'GoogleBigQuery',
    config: {
      // storage configuration
    }
  }
});

// Create run configuration
const runConfig = new RunConfig({
  type: 'INCREMENTAL',
  data: [
    { configField: 'date', value: '2024-01-01' }
  ],
  state: { lastRun: '2024-01-01T00:00:00Z' }
});

await runner.run(datamartId, runId, config, runConfig);
```

### Using ConnectorExecutionService Directly

```javascript
const ConnectorExecutionService = require('@owox/connector-runner/src/application/services/connector-execution-service');
const { Config, RunConfig } = require('@owox/connector-runner/src/application/dto');

const executionService = new ConnectorExecutionService();
const datamartId = 'my-datamart';
const runId = 'run-' + Date.now();

const config = new Config({
  // configuration object
});

const runConfig = new RunConfig({
  type: 'INCREMENTAL',
  data: [],
  state: {}
});

await executionService.execute(datamartId, runId, config, runConfig);
```

## Configuration Structure

### Configuration Schema

The connector configuration JSON file has the following structure:

```json
{
  "name": "ConnectorName", // The class name of the connector
  "description": "Connector Description", // The description of the connector
  "source": {
    "name": "ConnectorName", // The name of the connector. (Connector dir name)
    "config": {
      // The connector configuration parameters. The parameters are defined in the connector constructor.
      "ParameterName": {
        "value": "ParameterValue"
      }
    }
  },
  "storage": {
    "name": "StorageName", // The name of the storage. (Storage dir name)
    "config": {
      // The storage configuration parameters. The parameters are defined in the storage constructor.
      "ParameterName": {
        "value": "ParameterValue"
      }
    }
  }
}
```

> **Note**: The configuration structure has been updated from the legacy `integration` field to `source` for better clarity.

### Run Configuration

The run configuration controls how the connector executes:

```javascript
const runConfig = new RunConfig({
  type: 'INCREMENTAL', // Run type: 'INCREMENTAL', 'MANUAL_BACKFILL', 'FULL_REFRESH', 'CUSTOM'
  data: [              // Additional run parameters
    { configField: 'date', value: '2024-01-01' },
    { configField: 'limit', value: 100 }
  ],
  state: {             // Previous run state for incremental runs
    lastRun: '2024-01-01T00:00:00Z'
  }
});
```

#### Run Types

- **`INCREMENTAL`**: Only fetch new data since the last run
- **`MANUAL_BACKFILL`**: Fetch data for a specific date range
- **`FULL_REFRESH`**: Fetch all available data
- **`CUSTOM`**: Custom run type with specific parameters

### Configuration Parameters

- **`name`** (string): The class name of the connector
- **`description`** (string): Description of the connector
- **`source`** (object): Source configuration
  - **`name`** (string): The name of the source connector (corresponds to directory name in `packages/connectors/src/Sources`)
  - **`config`** (object): Source-specific configuration parameters
- **`storage`** (object): Storage configuration
  - **`name`** (string): The name of the storage backend (corresponds to directory name in `packages/connectors/src/Storages`)
  - **`config`** (object): Storage-specific configuration parameters

## Example Configurations

### TikTok Ads to Google BigQuery

```json
{
  "name": "TikTokAdsConnector",
  "description": "TikTok Ads Connector to Google BigQuery",
  "source": {
    "name": "TikTokAds",
    "config": {
      "AccessToken": {
        "value": "YOUR_ACCESS_TOKEN"
      },
      "AppId": {
        "value": "YOUR_APP_ID"
      },
      "AppSecret": {
        "value": "YOUR_APP_SECRET"
      },
      "AdvertiserIDs": {
        "value": "YOUR_ADVERTISER_ID"
      },
      "Objects": {
        "value": "campaigns"
      },
      "DataLevel": {
        "value": "AUCTION_AD"
      },
      "StartDate": {
        "value": "2023-01-01"
      },
      "ReimportLookbackWindow": {
        "value": 5
      },
      "Fields": {
        "value": "campaigns campaign_id, campaigns campaign_name"
      }
    }
  },
  "storage": {
    "name": "GoogleBigQuery",
    "config": {
      "DestinationLocation": {
        "value": "US"
      },
      "DestinationDatasetID": {
        "value": "YOUR_DATASET_ID"
      },
      "DestinationProjectID": {
        "value": "YOUR_PROJECT_ID"
      },
      "DestinationDatasetName": {
        "value": "YOUR_DATASET_NAME"
      },
      "ProjectID": {
        "value": "YOUR_PROJECT_ID"
      }
    }
  }
}
```

### TikTok Ads to AWS Athena

```json
{
  "name": "TikTokAdsConnector",
  "description": "TikTok Ads Connector to AWS Athena",
  "source": {
    "name": "TikTokAds",
    "config": {
      "AccessToken": {
        "value": "YOUR_ACCESS_TOKEN"
      },
      "AppId": {
        "value": "YOUR_APP_ID"
      },
      "AppSecret": {
        "value": "YOUR_APP_SECRET"
      },
      "AdvertiserIDs": {
        "value": "YOUR_ADVERTISER_ID"
      },
      "Objects": {
        "value": "campaigns"
      },
      "DataLevel": {
        "value": "AUCTION_AD"
      },
      "StartDate": {
        "value": "2023-01-01"
      },
      "ReimportLookbackWindow": {
        "value": 1
      },
      "Fields": {
        "value": "campaigns campaign_id, campaigns campaign_name"
      }
    }
  },
  "storage": {
    "name": "AwsAthena",
    "config": {
      "AWSRegion": {
        "value": "us-east-1"
      },
      "AWSAccessKeyId": {
        "value": "YOUR_ACCESS_KEY_ID"
      },
      "AWSSecretAccessKey": {
        "value": "YOUR_SECRET_ACCESS_KEY"
      },
      "S3BucketName": {
        "value": "YOUR_BUCKET_NAME"
      },
      "S3Prefix": {
        "value": "tiktok_ads_"
      },
      "AthenaDatabaseName": {
        "value": "YOUR_DATABASE_NAME"
      },
      "DestinationTableName": {
        "value": "tiktok_ads_"
      },
      "AthenaOutputLocation": {
        "value": "s3://YOUR_BUCKET_NAME/athena_dir"
      },
      "MaxBufferSize": {
        "value": 250
      }
    }
  }
}
```

## Architecture

```text
src/
├── core/
│   ├── interfaces/                 # Abstract interfaces for extensibility
│   │   ├── execution-environment.js
│   │   ├── dependency-manager.js
│   │   └── template-renderer.js
│   └── domain/                     # Domain objects and business logic
│       └── run-context.js          # Execution context with environment variables
├── infrastructure/                 # Implementation details
│   ├── environments/
│   │   └── nodejs-environment.js   # Node.js execution environment
│   ├── dependencies/
│   │   └── npm-dependency-manager.js
│   └── templates/
│       └── nodejs-template-renderer.js
├── application/                    # Application services and DTOs
│   ├── services/
│   │   └── connector-execution-service.js
│   └── dto/
│       ├── config.js               # Configuration DTOs
│       └── run-config.js           # Run configuration DTO
└── cli/
    └── connector-runner-cli.js     # Command line interface
```

### Core Components

The connector runner consists of several key components:

#### ConnectorRunner (`src/index.js`)

Main orchestrator class that:

- Validates configuration parameters
- Creates isolated environments for each run
- Manages connector execution lifecycle
- Handles cleanup after execution

#### ConnectorExecutionService (`src/application/services/connector-execution-service.js`)

Service responsible for orchestrating connector execution:

- Validates parameters and storage environments
- Creates run contexts with environment variables
- Manages execution lifecycle and error handling
- Coordinates with execution environments

#### RunContext (`src/core/domain/run-context.js`)

Domain object representing the execution context:

- Manages datamart ID, run ID, and configurations
- Generates environment variables for connector execution
- Provides unique identifiers for runs

#### Config DTOs (`src/application/dto/`)

Data Transfer Objects for configuration validation:

- `Config`: Main configuration wrapper
- `SourceConfig`: Source-specific configuration
- `StorageConfig`: Storage-specific configuration
- `RunConfig`: Run configuration with type, data, and state

#### NodeJsEnvironment (`src/infrastructure/environments/nodejs-environment.js`)

Manages isolated Node.js environments:

- Creates temporary directories for each run
- Installs required dependencies
- Generates runner templates
- Cleans up resources after execution

#### NodeJsTemplateRenderer (`src/infrastructure/templates/nodejs-template-renderer.js`)

Generates execution templates that:

- Import required dependencies as globals
- Set up OWOX connector libraries
- Handle environment variables (OW_CONFIG, OW_RUN_CONFIG, etc.)
- Execute the specified connector with proper error handling

### Execution Flow

1. **Configuration Validation**: Validates the provided JSON configuration and run configuration
2. **Run Context Creation**: Creates a run context with environment variables
3. **Environment Setup**: Creates an isolated Node.js environment with required dependencies
4. **Template Generation**: Generates a runner script with proper imports and configuration
5. **Connector Execution**: Spawns a Node.js process to run the connector
6. **Cleanup**: Removes temporary files and dependencies

### Environment Variables

The connector runner passes configuration to the connector via environment variables:

- **`OW_DATAMART_ID`**: The ID of the datamart being executed
- **`OW_RUN_ID`**: The unique ID for this run
- **`OW_CONFIG`**: JSON string containing the main configuration
- **`OW_RUN_CONFIG`**: JSON string containing the run configuration

### Isolation Strategy

Each connector run operates in a completely isolated environment:

- Separate working directories under `../../dist/data-marts/conectivity/runs`
- Independent `package.json` and `node_modules`
- Environment variables for configuration passing
- Automatic cleanup after execution

## Testing

The connector runner includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Test Structure

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions
- **DTO Tests**: Test configuration validation and serialization
- **Template Tests**: Test template generation and environment variable handling

## Development

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting
npm run format:check
```
