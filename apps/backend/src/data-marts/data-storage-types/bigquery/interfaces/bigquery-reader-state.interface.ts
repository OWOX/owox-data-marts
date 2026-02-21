import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';

/**
 * Serializable state for BigQuery report reader
 */
export interface BigQueryReaderState {
  type: DataStorageType.GOOGLE_BIGQUERY;
  reportConfig: {
    storageCredentials: BigQueryCredentials;
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
