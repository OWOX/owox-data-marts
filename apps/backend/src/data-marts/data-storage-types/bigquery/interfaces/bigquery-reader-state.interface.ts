import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';

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
 * Type guard to check if state is BigQuery reader state
 */
export function isBigQueryReaderState(
  state: DataStorageReportReaderState
): state is BigQueryReaderState {
  return state?.type === DataStorageType.GOOGLE_BIGQUERY;
}
