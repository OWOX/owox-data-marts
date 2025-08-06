import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';

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
 * Type guard to check if state is Athena reader state
 */
export function isAthenaReaderState(
  state: DataStorageReportReaderState
): state is AthenaReaderState {
  return state?.type === DataStorageType.AWS_ATHENA;
}
