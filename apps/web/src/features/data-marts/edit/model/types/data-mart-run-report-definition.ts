import type {
  DataMartRunReportDestinationConfigDto,
  DataMartRunReportOutputConfigDto,
} from '../../../shared/types/api/shared';

export interface DataMartRunReportDefinition {
  title: string;
  destination: {
    id: string;
    title: string;
    type: string;
  };
  destinationConfig: DataMartRunReportDestinationConfigDto;
  outputConfig?: DataMartRunReportOutputConfigDto | null;
  executionSqlQuery?: string;
}
