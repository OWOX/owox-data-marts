import { DataStorageReportReader } from '../../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportDataDescription } from './report-data-description.dto';

/**
 * Represents cached report reader data with metadata
 * Used across Looker Studio connector services and cache service
 */
export interface CachedReaderData {
  /** The data storage report reader instance */
  reader: DataStorageReportReader;

  /** Description of the report data structure */
  dataDescription: ReportDataDescription;

  /** Indicates whether the data was retrieved from cache */
  fromCache: boolean;
}
