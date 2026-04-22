import { DataStorageReportReader } from '../../data-storage-types/interfaces/data-storage-report-reader.interface';
import { BlendingDecision } from './blending-decision.dto';
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

  /**
   * Blending decision produced while preparing the reader. Carried on the
   * DTO so consumers (e.g. Looker run logger) can inspect the resolved SQL
   * without re-running metadata lookups.
   */
  blendingDecision: BlendingDecision;
}
