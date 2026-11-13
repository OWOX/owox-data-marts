import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';

/**
 * Serializable state for DuckDB report reader.
 *
 * Unlike Snowflake/Athena (a server-side query handle you can re-poll), DuckDB has no
 * server: the state is the SQL text, which a restored reader runs again from its first row.
 */
export interface DuckDbReaderState {
  type: DataStorageType.DUCKDB;
  sql?: string;
}

/**
 * Type guard to check if state is DuckDB reader state
 */
export function isDuckDbReaderState(
  state: DataStorageReportReaderState
): state is DuckDbReaderState {
  return state?.type === DataStorageType.DUCKDB;
}
