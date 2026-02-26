import { InsightArtifactSqlPreviewResponseApiDto } from './insight-artifact-sql-preview-response-api.dto';

export type InsightArtifactSqlPreviewTriggerResponseApiDto =
  | InsightArtifactSqlPreviewResponseApiDto
  | { error: string };
