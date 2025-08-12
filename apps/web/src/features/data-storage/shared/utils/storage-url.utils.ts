import { isGoogleBigQueryStorage, isAwsAthenaStorage } from '../model/types/data-storage.ts';
import type { DataStorage } from '../model/types/data-storage.ts';

/**
 * Interface for parsed fully qualified name components
 */
export interface ParsedFullyQualifiedName {
  dataset: string; // dataset for BigQuery, database for Athena
  table: string;
}

/**
 * Parses the fullyQualifiedName into dataset/database and table components
 * @param fullyQualifiedName The fully qualified name to parse (e.g., "dataset.table")
 * @returns An object with dataset and table properties, or null if invalid
 */
export function parseFullyQualifiedName(
  fullyQualifiedName: string
): ParsedFullyQualifiedName | null {
  const parts = fullyQualifiedName.split('.');
  if (parts.length !== 2) {
    console.error('Invalid fully qualified name format:', fullyQualifiedName);
    return null;
  }

  return {
    dataset: parts[0], // dataset for BigQuery, database for Athena
    table: parts[1],
  };
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
 * Generates an AWS Athena console URL for a specific region
 * @param region The AWS region
 * @returns The Athena console URL for the specified region
 */
export function getAthenaRegionUrl(region: string): string {
  const encodedRegion = encodeURIComponent(region);
  return `https://console.aws.amazon.com/athena/home?region=${encodedRegion}#/query-editor`;
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

  return 'Open data in storage';
}
