export type InsightTemplateSourceValidationStatus = 'VALID' | 'ERROR';

export interface InsightTemplateSourceResponseDto {
  templateSourceId: string;
  key: string;
  artifactId: string;
  title: string;
  sql: string;
  validationStatus: InsightTemplateSourceValidationStatus;
  validationError: string | null;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
}

export interface InsightTemplateSourceListResponseDto {
  data: InsightTemplateSourceResponseDto[];
}

export interface CreateInsightTemplateSourceRequestDto {
  key: string;
  title: string;
  sql: string;
}

export interface UpdateInsightTemplateSourceRequestDto {
  title: string;
  sql: string;
}

export interface InsightArtifactSqlPreviewTriggerResponseDto {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  limit: number;
}
