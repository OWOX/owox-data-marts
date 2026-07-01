import type { UserProjectionDto } from '../../../../../../shared/types/api';

import type {
  DataMartRunAiSourceDefinitionDto,
  DataMartRunInsightDefinitionDto,
  DataMartRunInsightTemplateDefinitionDto,
  DataMartRunReportDefinitionDto,
} from '../shared';
import type { DataMartDefinitionDto } from './data-mart-definition.dto';
import { DataMartRunStatus } from '../../../enums';

export interface DataMartRunResponseDto {
  id: string;
  dataMartId: string;
  status: DataMartRunStatus;
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
  insightDefinition: DataMartRunInsightDefinitionDto | null;
  insightId: string | null;
  insightTemplateDefinition: DataMartRunInsightTemplateDefinitionDto | null;
  insightTemplateId: string | null;
  aiSourceDefinition: DataMartRunAiSourceDefinitionDto | null;
  createdByUser: UserProjectionDto | null;
  additionalParams: Record<string, unknown> | null;
  /** Grand-totals summary (numeric fields × allowed aggregations); null/absent when none. */
  totals?: Record<string, number | string | boolean | null> | null;
}

export interface ProjectDataMartRunRefResponseDto {
  id: string;
  title: string;
}

export interface ProjectDataMartRunResponseDto extends DataMartRunResponseDto {
  dataMart: ProjectDataMartRunRefResponseDto;
}
