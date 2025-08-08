import { BigQueryReaderState } from '../bigquery/interfaces/bigquery-reader-state.interface';
import { AthenaReaderState } from '../athena/interfaces/athena-reader-state.interface';

/**
 * Union type for all supported reader states
 */
export type DataStorageReportReaderState = BigQueryReaderState | AthenaReaderState;
