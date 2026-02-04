import {
  isGoogleBigQueryStorage,
  isAwsAthenaStorage,
  isSnowflakeStorage,
  isRedshiftStorage,
} from '../model/types/data-storage.ts';
import type { DataStorage } from '../model/types/data-storage.ts';

export interface ParsedFullyQualifiedName {
  dataset: string;
  schema?: string;
  table: string;
}

export function parseFullyQualifiedName(
  fullyQualifiedName: string
): ParsedFullyQualifiedName | null {
  const parts = fullyQualifiedName.split('.');
  if (parts.length === 2) {
    return {
      dataset: parts[0],
      table: parts[1],
    };
  } else if (parts.length === 3) {
    return {
      dataset: parts[0],
      schema: parts[1],
      table: parts[2],
    };
  }

  console.error('Invalid fully qualified name format:', fullyQualifiedName);
  return null;
}

/**
 * Generates a Google BigQuery console URL for a specific table
 * @param projectId The Google Cloud project ID
 * @param dataset The dataset name
 * @param table The table name
 * @returns The BigQuery console URL for the specified table
 */
export function getBigQueryTableUrl(projectId: string, dataset: string, table: string): string {
  const encodedProjectId = encodeURIComponent(projectId);
  const encodedDataset = encodeURIComponent(dataset);
  const encodedTable = encodeURIComponent(table);
  return `https://console.cloud.google.com/bigquery?project=${encodedProjectId}&ws=!1m5!1m4!4m3!1s${encodedProjectId}!2s${encodedDataset}!3s${encodedTable}`;
}

/**
 * Generates a Google BigQuery console URL for a specific dataset
 * @param projectId The Google Cloud project ID
 * @param dataset The dataset name
 * @returns The BigQuery console URL for the specified dataset
 */
export function getBigQueryDatasetUrl(projectId: string, dataset: string): string {
  const encodedProjectId = encodeURIComponent(projectId);
  const encodedDataset = encodeURIComponent(dataset);
  return `https://console.cloud.google.com/bigquery?project=${encodedProjectId}&ws=!1m4!1m3!3m2!1s${encodedProjectId}!2s${encodedDataset}`;
}

/**
 * Generates an AWS Athena console URL for a specific region
 * @param region The AWS region
 * @returns The Athena console URL for the specified region
 */
export function getAthenaRegionUrl(region: string): string {
  const encodedRegion = encodeURIComponent(region);
  return `https://console.aws.amazon.com/athena/home?region=${encodedRegion}#/query-editor`;
}

/**
 * Generates an AWS Redshift Query Editor v2 URL for a specific region
 * @param region The AWS region
 * @returns The Redshift Query Editor v2 console URL for the specified region
 */
export function getRedshiftQueryEditorUrl(region: string): string {
  // We don't encode region here because it's part of the domain data
  return `https://${region}.console.aws.amazon.com/sqlworkbench/home`;
}

/**
 * Generates a Snowflake console URL
 * @param account The Snowflake account identifier
 * @returns The Snowflake console URL
 */
export function getSnowflakeConsoleUrl(account: string): string {
  return `https://${account}.snowflakecomputing.com/`;
}

/**
 * Generates the appropriate storage URL based on storage type and configuration
 * @param storage The data storage configuration
 * @param fullyQualifiedName The fully qualified name of the table/dataset
 * @returns The storage console URL, or null if not supported
 */
export function getStorageUrl(storage: DataStorage, fullyQualifiedName: string): string | null {
  const parsedName = parseFullyQualifiedName(fullyQualifiedName);
  if (!parsedName) {
    return null;
  }

  const { dataset, table } = parsedName;

  if (isGoogleBigQueryStorage(storage)) {
    return getBigQueryTableUrl(storage.config.projectId, dataset, table);
  }

  if (isAwsAthenaStorage(storage)) {
    return getAthenaRegionUrl(storage.config.region);
  }

  if (isSnowflakeStorage(storage)) {
    return getSnowflakeConsoleUrl(storage.config.account);
  }

  if (isRedshiftStorage(storage)) {
    return getRedshiftQueryEditorUrl(storage.config.region);
  }

  return null;
}

/**
 * Opens the storage console in a new tab
 * @param storage The data storage configuration
 * @param fullyQualifiedName The fully qualified name of the table/dataset
 * @returns true if the URL was opened successfully, false otherwise
 */
export function openStorageConsole(storage: DataStorage, fullyQualifiedName: string): boolean {
  const url = getStorageUrl(storage, fullyQualifiedName);
  if (!url) {
    return false;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Gets the display text for the storage open button based on storage type
 * @param storage The data storage configuration
 * @returns Human-readable button text
 */
export function getStorageButtonText(storage: DataStorage): string {
  if (isGoogleBigQueryStorage(storage)) {
    return 'Open table in Google BigQuery';
  }

  if (isAwsAthenaStorage(storage)) {
    return 'Open region in AWS Athena';
  }

  if (isSnowflakeStorage(storage)) {
    return 'Open console in Snowflake';
  }

  if (isRedshiftStorage(storage)) {
    return 'Open Query Editor v2 in AWS Redshift';
  }

  return 'Open data in storage';
}
