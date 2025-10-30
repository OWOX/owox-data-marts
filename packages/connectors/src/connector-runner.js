#!/usr/bin/env node

// Import all required dependencies and make them global
const OWOX = require('@owox/connectors');
const deasync = require('@kaciras/deasync');
const request = require('sync-request');
const AdmZip = require('adm-zip');

// Google BigQuery
const { BigQuery } = require('@google-cloud/bigquery');

// AWS SDK
const {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  ListWorkGroupsCommand
} = require('@aws-sdk/client-athena');

const {
  S3Client,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListBucketsCommand
} = require('@aws-sdk/client-s3');

const { Upload } = require('@aws-sdk/lib-storage');

// Make dependencies globally available
global.OWOX = OWOX;
global.deasync = deasync;
global.request = request;
global.AdmZip = AdmZip;
global.BigQuery = BigQuery;

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

  // Parse configuration
  let envConfig;
  try {
    envConfig = JSON.parse(process.env.OW_CONFIG);
  } catch (error) {
    throw new Error(`Failed to parse OW_CONFIG: ${error.message}`);
  }

  // NodeJsConfig expects the full configuration object, not just the parsed JSON
  // It needs the structure that matches what Config class provides
  const config = new Core.NodeJsConfig(envConfig);

  const runConfigJson = process.env.OW_RUN_CONFIG;
  const runConfig = runConfigJson
    ? new Core.AbstractRunConfig(JSON.parse(runConfigJson))
    : new Core.AbstractRunConfig();

  const sourceName = config.getSourceName();
  const storageName = config.getStorageName();

  const sourceClass = global[sourceName];
  if (!sourceClass) {
    throw new Error(`Source class ${sourceName} not found`);
  }

  const storageClass = global[storageName];
  if (!storageClass) {
    throw new Error(`Storage class ${storageName} not found`);
  }

  const source = new sourceClass[sourceName + 'Source'](config);
  const connector = new sourceClass[sourceName + 'Connector'](
    config,
    source,
    storageName + 'Storage',
    runConfig
  );

  // Run the connector
  connector.run();
}

// Execute main and handle errors
main().catch(console.error);
