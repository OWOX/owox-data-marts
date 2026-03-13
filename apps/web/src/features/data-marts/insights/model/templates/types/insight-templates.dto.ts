import type { DataMartRunItem } from '../../../../edit';

export type TaskStatusCode = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'ERROR' | 'CANCELLED';

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
  lastRenderedTemplate: string | null;
  lastRenderedTemplateUpdatedAt: string | null;
  lastManualDataMartRun: Pick<DataMartRunItem, 'id' | 'status'> | null;
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
  title?: string;
  template?: string | null;
}

export interface UpdateInsightTemplateRequestDto {
  title: string;
  template?: string | null;
}

export interface InsightTemplateExecutionStatusResponseDto {
  status: TaskStatusCode;
}

export interface InsightTemplateRunTriggerItemDto {
  id: string;
  insightTemplateId: string;
  status: TaskStatusCode;
  createdAt: string;
  modifiedAt: string;
}

export interface InsightTemplateRunTriggersListResponseDto {
  data: InsightTemplateRunTriggerItemDto[];
}
