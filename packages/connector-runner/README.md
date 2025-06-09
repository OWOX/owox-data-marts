# NodeJS Runner for Connectors

A Node.js utility for running OWOX Data Marts connectors.

## Overview

The nodeJS connector runner allows you to execute data connectors on your machine, which is useful for running, development, testing, and debugging.

## Installation

```bash
# From the root directory of the repository
npm install
```

## Usage

To run a connector:

```bash
npm run connector-runner-node -- path/to/connector-config.json
```

## Connector Configuration

Connectors are defined using JSON configuration files. These files specify the data source integration, storage, and all necessary configuration parameters.

### Configuration Structure

The connector configuration JSON file has the following structure:

```json

{
    "name": "ConnectorName", // The class name of the connector 
    "description": "Connector Description", // The description of the connector
    "integration": {
        "name": "ConnectorName", // The class name of the connector
        "directory": "ConnectorDirectoryName", // The connector directory name 
        "config": {  // The connector configuration parameters. The parameters are defined in the connector constructor.
            "ParameterName": {
                "value": "ParameterValue"
            }
        }
    },
    "storage": {
        "name": "StorageName", // The class name of the storage
        "config": {  // The storage configuration parameters. The parameters are defined in the storage constructor.
            "ParameterName": {
                "value": "ParameterValue"
            }
        }
    }
}
```

### Example Configurations

#### TikTok Ads to Google BigQuery

```json
{
    "name": "TikTokAdsConnector",
    "description": "TikTok Ads Connector from xxx to Google BigQuery",
    "integration": {
        "name": "TikTokAdsConnector",
        "directory": "TikTokAds",
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
        "name": "GoogleBigQueryStorage",
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

#### TikTok Ads to AWS Athena

```json
{
    "name": "TikTokAdsConnector",
    "description": "TikTok Ads Connector from xxx to AWS Athena",
    "integration": {
        "name": "TikTokAdsConnector",
        "directory": "TikTokAds",
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
        "name": "AwsAthenaStorage",
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

## How It Works

The local runner:

1. Evaluates all JavaScript files in the relevant directories
2. Creates a configuration object from the provided JSON file
3. Instantiates the specified connector and connector
4. Executes the connector

## Supported Storage

- Google BigQuery
- AWS Athena

## Supported Data Sources

- TikTok Ads
- And others defined in the `packages/connectors/src/Sources` directory (Not tested)

## Dependencies

- @google-cloud/bigquery: For BigQuery storage
- AWS SDK (client-s3, client-athena, lib-storage): For AWS storage
- sync-request: For synchronous HTTP requests
- deasync: For synchronous JavaScript operations
