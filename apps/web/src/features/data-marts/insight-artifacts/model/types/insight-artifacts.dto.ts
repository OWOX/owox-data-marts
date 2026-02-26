import type { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';

export type InsightArtifactValidationStatus = 'VALID' | 'ERROR';

export interface InsightArtifactResponseDto {
  id: string;
  title: string;
  sql: string;
  validationStatus: InsightArtifactValidationStatus;
  validationError: string | null;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
}

export interface InsightArtifactListResponseDto {
  data: InsightArtifactResponseDto[];
}

export interface CreateInsightArtifactRequestDto {
  title: string;
  sql: string;
}

export interface UpdateInsightArtifactRequestDto {
  title: string;
  sql: string;
}

export interface RunInsightArtifactSqlPreviewRequestDto {
  sql?: string;
}

export interface InsightArtifactSqlPreviewResponseDto {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  limit: number;
}

export interface CreateInsightArtifactSqlPreviewTriggerResponseDto {
  triggerId: string;
}

export interface InsightArtifactSqlPreviewTriggerStatusResponseDto {
  status: TaskStatus;
}
