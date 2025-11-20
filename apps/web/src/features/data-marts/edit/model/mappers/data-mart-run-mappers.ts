import type { DataMartRunItem } from '../types/data-mart-run';
import type { DataMartRunResponseDto } from '../../../shared/types/api/response/data-mart-run.response.dto';
import type { DataMartDefinitionConfig, DataMartRunReportDefinition } from '../types';
import type { DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunListResponseDto } from '../../../shared/types/api';
import { DataMartRunStatus } from '../../../shared';

export const mapDataMartRunResponseDtoToEntity = (
  dto: DataMartRunResponseDto
): DataMartRunItem => ({
  id: dto.id,
  status: dto.status as DataMartRunStatus,
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
  insightId: dto.insightId,
});

export const mapDataMartRunListResponseDtoToEntity = (
  dto: DataMartRunListResponseDto
): DataMartRunItem[] => {
  return dto.runs.map(mapDataMartRunResponseDtoToEntity);
};
