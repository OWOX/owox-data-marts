import type { DataMartRunReportDefinitionDto } from '../shared';
import type { DataMartDefinitionDto } from './data-mart-definition.dto';

export interface DataMartRunResponseDto {
  id: string;
  status: string;
  createdAt: string;
  logs: string[] | null;
  errors: string[] | null;
  definitionRun: DataMartDefinitionDto;
  type: string;
  runType: string;
  startedAt: string | null;
  finishedAt: string | null;
  reportDefinition: DataMartRunReportDefinitionDto | null;
  reportId: string | null;
  insightId: string | null;
}
