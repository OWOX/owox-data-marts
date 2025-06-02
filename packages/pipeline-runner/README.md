# Pipeline NodeJS Runner for Integration Pipelines

A Node.js utility for running OWOX Data Marts integration pipelines.

## Overview

The nodeJS pipeline runner allows you to execute data pipelines on your machine, which is useful for running, development, testing, and debugging.

## Installation

```bash
# From the root directory of the repository
npm install
```

## Usage

To run a pipeline:

```bash
npm run pipeline-runner-node -- path/to/pipeline-config.json
```

## Pipeline Configuration

Pipelines are defined using JSON configuration files. These files specify the data source integration, storage, and all necessary configuration parameters.

### Configuration Structure

The pipeline configuration JSON file has the following structure:

```json

{
    "name": "PipelineName", // The class name of the pipeline 
    "description": "Pipeline Description", // The description of the pipeline
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
    "name": "TikTokAdsPipeline",
    "description": "TikTok Ads Pipeline from xxx to Google BigQuery",
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
    "name": "TikTokAdsPipeline",
    "description": "TikTok Ads Pipeline from xxx to AWS Athena",
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
3. Instantiates the specified connector and pipeline
4. Executes the pipeline

## Supported Storage

- Google BigQuery
- AWS Athena

## Supported Data Sources

- TikTok Ads
- And others defined in the `packages/connectors/src/Integrations` directory (Not tested)

## Dependencies

- @google-cloud/bigquery: For BigQuery storage
- AWS SDK (client-s3, client-athena, lib-storage): For AWS storage
- sync-request: For synchronous HTTP requests
- deasync: For synchronous JavaScript operations
