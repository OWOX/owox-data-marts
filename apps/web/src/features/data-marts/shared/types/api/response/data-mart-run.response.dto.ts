import type { DataMartRunReportDefinitionDto } from '../shared';
import type { DataMartDefinitionDto } from './data-mart-definition.dto';

export interface DataMartRunResponseDto {
  id: string;
  status: string;
  createdAt: string;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionDto | null;
  type: string | null;
  runType: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  reportDefinition: DataMartRunReportDefinitionDto | null;
}
