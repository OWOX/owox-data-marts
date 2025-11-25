import type { DataMartRunResponseDto } from '../../../../shared/types/api';
import type { TaskStatus } from '../../../../../../shared/types/task-status.enum.ts';

export interface InsightResponseDto {
  id: string;
  title: string;
  template: string | null;
  output: string | null;
  outputUpdatedAt: string | null;
  lastManualDataMartRun: DataMartRunResponseDto | null;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
}

export interface InsightListResponseDto {
  data: InsightResponseDto[];
}

export interface CreateInsightRequestDto {
  title: string;
  template?: string | null;
}

export type CreateInsightResponseDto = InsightResponseDto;

export interface UpdateInsightRequestDto {
  title: string;
  template: string | null;
}

export type UpdateInsightResponseDto = InsightResponseDto;

export interface UpdateInsightTitleRequestDto {
  title: string;
}

export interface InsightExecutionStatusResponseDto {
  status: TaskStatus;
}

export type UpdateInsightTitleResponseDto = InsightResponseDto;
