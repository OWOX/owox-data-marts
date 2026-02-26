import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';

/**
 * Serializable state for BigQuery report reader.
 *
 * Does NOT store credentials directly — credentials may contain
 * non-serializable objects (e.g. OAuth2Client). Instead, stores
 * `storageId` so credentials can be re-resolved at restore time.
 */
export interface BigQueryReaderState {
  type: DataStorageType.GOOGLE_BIGQUERY;
  storageId: string;
  reportConfig: {
    storageConfig: BigQueryConfig;
    definition: DataMartDefinition;
    definitionType: DataMartDefinitionType;
  };
  reportDataHeaders: ReportDataHeader[];
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
