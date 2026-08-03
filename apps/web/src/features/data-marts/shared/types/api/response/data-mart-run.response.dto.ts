import type { UserProjectionDto } from '../../../../../../shared/types/api';

import type {
  DataMartRunAiSourceDefinitionDto,
  DataMartRunInsightDefinitionDto,
  DataMartRunInsightTemplateDefinitionDto,
  DataMartRunReportDefinitionDto,
} from '../shared';
import type { DataMartDefinitionDto } from './data-mart-definition.dto';
import { DataMartRunStatus } from '../../../enums';
import type { DataQualityCompactSummary } from '../../../types/data-quality-summary.types';
import type { DataQualityRunDetails } from '../../../../data-quality/model/types';

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
  /** Grand-totals summary (numeric fields plus report-aggregated metrics × allowed
   * aggregations, excluding ANY_VALUE/STRING_AGG); values may be numbers or strings;
   * null/absent when none. */
  totals?: Record<string, number | string | boolean | null> | null;
  qualitySummary?: DataQualityCompactSummary | null;
  dataQuality?: DataQualityRunDetails | null;
}

export interface ProjectDataMartRunRefResponseDto {
  id: string;
  title: string;
}

export interface ProjectDataMartRunResponseDto extends DataMartRunResponseDto {
  dataMart: ProjectDataMartRunRefResponseDto;
}
