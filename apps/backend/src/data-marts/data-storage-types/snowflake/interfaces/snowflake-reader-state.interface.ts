import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';

/**
 * Serializable state for Snowflake report reader
 */
export interface SnowflakeReaderState {
  type: DataStorageType.SNOWFLAKE;
  queryId: string;
  currentRowIndex: number;
}

/**
 * Type guard to check if state is Snowflake reader state
 */
export function isSnowflakeReaderState(
  state: DataStorageReportReaderState
): state is SnowflakeReaderState {
  return state?.type === DataStorageType.SNOWFLAKE;
}
