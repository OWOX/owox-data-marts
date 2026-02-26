import type { DataMartRunResponseDto } from '../../../shared/types/api';
import type { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';

export type InsightTemplateSourceType = 'CURRENT_DATA_MART' | 'INSIGHT_ARTIFACT';
export type InsightTemplateSourceKind = 'TABLE' | 'VALUE';

export interface InsightTemplateSourceDto {
  key: string;
  type: InsightTemplateSourceType;
  kind?: InsightTemplateSourceKind;
  artifactId?: string | null;
}

export interface InsightTemplateResponseDto {
  id: string;
  title: string;
  template: string | null;
  sources: InsightTemplateSourceDto[];
  lastRenderedTemplate: string | null;
  lastRenderedTemplateUpdatedAt: string | null;
  lastManualDataMartRun: DataMartRunResponseDto | null;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
}

export interface InsightTemplateListItemDto {
  id: string;
  title: string;
  sourcesCount: number;
  lastRenderedTemplateUpdatedAt: string | null;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
}

export interface InsightTemplateListResponseDto {
  data: InsightTemplateListItemDto[];
}

export interface CreateInsightTemplateRequestDto {
  title: string;
  template?: string | null;
  sources?: InsightTemplateSourceDto[];
}

export interface UpdateInsightTemplateRequestDto {
  title: string;
  template?: string | null;
  sources?: InsightTemplateSourceDto[];
}

export interface InsightTemplateExecutionStatusResponseDto {
  status: TaskStatus;
}
