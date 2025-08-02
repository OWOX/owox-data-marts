import { DataStorageType } from "../../../data-storage-types/enums/data-storage-type.enum";

/**
 * Serializable state for BigQuery report reader
 */
export interface BigQueryReaderState {
  type: DataStorageType.GOOGLE_BIGQUERY;
  reportResultTable?: {
    projectId: string;
    datasetId: string;
    tableId: string;
  };
  contextGcpProject: string;
}

/**
 * Serializable state for Athena report reader
 */
export interface AthenaReaderState {
  type: DataStorageType.AWS_ATHENA;
  queryExecutionId?: string;
  outputBucket: string;
  outputPrefix: string;
}

/**
 * Union type for all supported reader states
 */
export type ReaderState = BigQueryReaderState | AthenaReaderState;

/**
 * Type guard to check if state is BigQuery reader state
 */
export function isBigQueryReaderState(state: ReaderState): state is BigQueryReaderState {
  return state.type === DataStorageType.GOOGLE_BIGQUERY;
}

/**
 * Type guard to check if state is Athena reader state
 */
export function isAthenaReaderState(state: ReaderState): state is AthenaReaderState {
  return state.type === DataStorageType.AWS_ATHENA;
}
