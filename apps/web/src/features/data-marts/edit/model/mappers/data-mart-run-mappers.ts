import type { DataMartRunItem } from '../types';
import type { DataMartRunResponseDto } from '../../../shared/types/api';
import type {
  DataMartDefinitionConfig,
  DataMartRunInsightTemplateDefinition,
  DataMartRunReportDefinition,
} from '../types';
import type { DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunListResponseDto } from '../../../shared/types/api';

export const mapDataMartRunResponseDtoToEntity = (
  dto: DataMartRunResponseDto
): DataMartRunItem => ({
  id: dto.id,
  status: dto.status,
  createdAt: new Date(dto.createdAt),
  logs: dto.logs ?? [],
  errors: dto.errors ?? [],
  definitionRun: dto.definitionRun as DataMartDefinitionConfig,
  type: dto.type as DataMartRunType,
  triggerType: dto.runType as DataMartRunTriggerType,
  startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
  finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : null,
  reportDefinition: dto.reportDefinition
    ? (dto.reportDefinition as DataMartRunReportDefinition)
    : null,
  reportId: dto.reportId,
  insightDefinition: dto.insightDefinition ?? null,
  insightId: dto.insightId,
  insightTemplateDefinition: dto.insightTemplateDefinition
    ? (dto.insightTemplateDefinition as DataMartRunInsightTemplateDefinition)
    : null,
  insightTemplateId: dto.insightTemplateId,
  createdByUser: dto.createdByUser,
});

export const mapDataMartRunListResponseDtoToEntity = (
  dto: DataMartRunListResponseDto
): DataMartRunItem[] => {
  return dto.runs.map(mapDataMartRunResponseDtoToEntity);
};
