#!/usr/bin/env node

/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// Import all required dependencies and make them global
const OWOX = require('@owox/connectors');
const AdmZip = require('adm-zip');

// Google BigQuery
const { BigQuery } = require('@google-cloud/bigquery');

// Snowflake
const snowflake = require('snowflake-sdk');

// Databricks
const databricks = require('@databricks/sql');

// AWS SDK
const {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  ListWorkGroupsCommand,
} = require('@aws-sdk/client-athena');

const {
  S3Client,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListBucketsCommand,
} = require('@aws-sdk/client-s3');

const {
  RedshiftDataClient,
  BatchExecuteStatementCommand,
  ExecuteStatementCommand,
  DescribeStatementCommand,
  GetStatementResultCommand,
} = require('@aws-sdk/client-redshift-data');

const { Upload } = require('@aws-sdk/lib-storage');

// Make dependencies globally available
global.OWOX = OWOX;
global.AdmZip = AdmZip;
global.BigQuery = BigQuery;
global.snowflake = snowflake;
global.databricks = databricks;

// AWS Athena
global.AthenaClient = AthenaClient;
global.StartQueryExecutionCommand = StartQueryExecutionCommand;
global.GetQueryExecutionCommand = GetQueryExecutionCommand;
global.GetQueryResultsCommand = GetQueryResultsCommand;
global.ListWorkGroupsCommand = ListWorkGroupsCommand;

// AWS S3
global.S3Client = S3Client;
global.DeleteObjectsCommand = DeleteObjectsCommand;
global.ListObjectsV2Command = ListObjectsV2Command;
global.ListBucketsCommand = ListBucketsCommand;

// AWS Redshift
global.RedshiftDataClient = RedshiftDataClient;
global.BatchExecuteStatementCommand = BatchExecuteStatementCommand;
global.ExecuteStatementCommand = ExecuteStatementCommand;
global.DescribeStatementCommand = DescribeStatementCommand;
global.GetStatementResultCommand = GetStatementResultCommand;

// AWS S3 Upload
global.Upload = Upload;

// Extract OWOX libraries and make them global
const { Core, Connectors, Storages } = OWOX;

Object.keys(Core).forEach(key => {
  global[key] = Core[key];
});

Object.keys(Storages).forEach(key => {
  const storage = Storages[key];
  global[key] = storage;
  Object.keys(storage).forEach(key => {
    global[key] = storage[key];
  });
});

Object.keys(Connectors).forEach(key => {
  const connector = Connectors[key];
  global[key] = connector;
  Object.keys(connector).forEach(key => {
    global[key] = connector[key];
  });
});

// Main execution function
async function main() {
  // Validate required environment variables
  if (!process.env.OW_CONFIG) {
    throw new Error('OW_CONFIG environment variable is required');
  }
  if (!process.env.OW_DATAMART_ID) {
    throw new Error('OW_DATAMART_ID environment variable is required');
  }
  if (!process.env.OW_RUN_ID) {
    throw new Error('OW_RUN_ID environment variable is required');
  }

  const isTestMode = Boolean(process.env.OW_TEST);
  const testLimits = isTestMode
    ? {
        maxRows: process.env.OW_TEST_MAX_ROWS
          ? parseInt(process.env.OW_TEST_MAX_ROWS, 10)
          : undefined,
        maxPages: process.env.OW_TEST_MAX_PAGES
          ? parseInt(process.env.OW_TEST_MAX_PAGES, 10)
          : undefined,
        maxSlices: process.env.OW_TEST_MAX_SLICES
          ? parseInt(process.env.OW_TEST_MAX_SLICES, 10)
          : 10,
      }
    : {};

  // Parse configuration
  let envConfig;
  try {
    envConfig = JSON.parse(process.env.OW_CONFIG);
  } catch (error) {
    throw new Error(`Failed to parse OW_CONFIG: ${error.message}`);
  }

  let runConfigData = null;
  if (process.env.OW_RUN_CONFIG) {
    try {
      runConfigData = JSON.parse(process.env.OW_RUN_CONFIG);
    } catch (error) {
      throw new Error(`Failed to parse OW_RUN_CONFIG: ${error.message}`);
    }
  }

  // Build context (replaces NodeJsConfig + AbstractRunConfig)
  const context = new Core.AbstractContext({
    source: { name: envConfig.source.name, config: envConfig.source.config || {} },
    storage: { name: envConfig.storage.name, config: envConfig.storage.config || {} },
    runConfig: runConfigData,
    env: {
      datamartId: process.env.OW_DATAMART_ID,
      runId: process.env.OW_RUN_ID,
    },
  });

  // Resolve Source class from globals
  const sourceName = context.sourceName;
  const connectorBundle = global[sourceName];
  const SourceClass = connectorBundle && connectorBundle[sourceName + 'Source'];

  // Resolve Storage class from globals (or use TestStorage in test mode)
  let StorageClass;
  if (isTestMode) {
    StorageClass = Core.TestStorage;
  } else {
    const storageClassName = context.storageName + 'Storage';
    StorageClass = global[storageClassName];
    if (!StorageClass) {
      throw new Error(`Storage class "${storageClassName}" not found in global namespace`);
    }
  }

  // A custom (DB-stored) connector ships its manifest via OW_MANIFEST — it is not
  // in the bundle. Otherwise resolve a hand-written Source class or a bundled
  // declarative manifest, exactly as before.
  let customManifest = null;
  if (process.env.OW_MANIFEST) {
    try {
      customManifest = JSON.parse(process.env.OW_MANIFEST);
    } catch (error) {
      throw new Error(`Failed to parse OW_MANIFEST: ${error.message}`);
    }
  }

  const sourceOptions = isTestMode ? { ...testLimits, emitSample: true } : testLimits;

  let source;
  if (customManifest) {
    const model = new Core.ManifestParser().parse(JSON.stringify(customManifest));
    source = new Core.DeclarativeSource(context, model, sourceOptions);
  } else if (SourceClass) {
    source = new SourceClass(context);
  } else if (connectorBundle && connectorBundle.manifest && connectorBundle.manifest.nodes) {
    const model = new Core.ManifestParser().parse(JSON.stringify(connectorBundle.manifest));
    source = new Core.DeclarativeSource(context, model, sourceOptions);
  } else {
    throw new Error(
      `Source class "${sourceName}Source" not found and no declarative manifest for "${sourceName}"`
    );
  }

  // Use the universal AbstractConnector (no per-connector Connector class)
  const connector = new Core.AbstractConnector(context, source, StorageClass);
  await connector.run();
}

// Execute main and handle errors
main().catch(error => {
  console.error(JSON.stringify(Core.RunFailureReport.toEnvelope(error)));
});
