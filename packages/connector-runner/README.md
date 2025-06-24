# NodeJS Runner for Connectors

A Node.js utility for running OWOX Data Marts connectors in isolated environments.

## Overview

The NodeJS connector runner allows you to execute data connectors on your machine in isolated Node.js environments. This is particularly useful for development, testing, debugging, and production runs of data integration connectors.

### Key Features

- **Isolated Environment Creation**: Creates separate Node.js environments for each connector run
- **Automatic Dependency Management**: Installs required dependencies for each connector
- **Configuration Validation**: Validates connector and storage configurations
- **Storage Support**: Supports multiple storage backends (Google BigQuery, AWS Athena)
- **Resource Cleanup**: Automatically cleans up temporary files and dependencies after execution

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
const ConnectorRunner = require('@owox/connector-runner');

const runner = new ConnectorRunner();
const datamartId = 'my-datamart';
const runId = 'run-' + Date.now();
const config = {
  name: 'TikTokAdsConnector',
  source: {
    /* source config */
  },
  storage: {
    /* storage config */
  },
};

await runner.run(datamartId, runId, config);
```

## Configuration Structure

### Configuration Schema

The connector configuration JSON file has the following structure:

```json
{
  "name": "ConnectorName", // The class name of the connector
  "description": "Connector Description", // The description of the connector
  "source": {
    "name": "ConnectorName", // The name of the connector. (Conector dir name)
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
      "DestinationTableNamePrefix": {
        "value": ""
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
      "DestinationTableNamePrefix": {
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
│       └── run-context.js
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
│       └── run-config.js
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

#### Environment (`src/environment.js`)

Manages isolated Node.js environments:

- Creates temporary directories for each run
- Installs required dependencies
- Generates runner templates
- Cleans up resources after execution

#### RunConfig DTOs (`src/dto/run-config.js`)

Data Transfer Objects for configuration validation:

- `RunConfig`: Main configuration wrapper
- `SourceConfig`: Source-specific configuration
- `StorageConfig`: Storage-specific configuration

#### Runner Template (`src/templates/runner-template.js`)

Generates execution templates that:

- Import required dependencies as globals
- Set up OWOX connector libraries
- Execute the specified connector

### Execution Flow

1. **Configuration Validation**: Validates the provided JSON configuration
2. **Environment Setup**: Creates an isolated Node.js environment with required dependencies
3. **Template Generation**: Generates a runner script with proper imports and configuration
4. **Connector Execution**: Spawns a Node.js process to run the connector
5. **Cleanup**: Removes temporary files and dependencies

### Isolation Strategy

Each connector run operates in a completely isolated environment:

- Separate working directories under `../../dist/data-marts/conectivity/runs`
- Independent `package.json` and `node_modules`
- Environment variables for configuration passing
- Automatic cleanup after execution

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
