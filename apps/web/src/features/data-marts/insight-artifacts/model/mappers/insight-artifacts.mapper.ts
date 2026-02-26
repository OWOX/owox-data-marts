import type { InsightArtifactEntity } from '../types/insight-artifact.entity';
import type {
  CreateInsightArtifactRequestDto,
  InsightArtifactListResponseDto,
  InsightArtifactResponseDto,
  UpdateInsightArtifactRequestDto,
} from '../types/insight-artifacts.dto';

export const mapInsightArtifactFromDto = (
  dto: InsightArtifactResponseDto
): InsightArtifactEntity => ({
  id: dto.id,
  title: dto.title,
  sql: dto.sql,
  validationStatus: dto.validationStatus,
  validationError: dto.validationError ?? null,
  createdById: dto.createdById,
  createdAt: new Date(dto.createdAt),
  modifiedAt: new Date(dto.modifiedAt),
});

export const mapInsightArtifactListFromDto = (
  dto: InsightArtifactListResponseDto
): InsightArtifactEntity[] => dto.data.map(mapInsightArtifactFromDto);

export const mapToCreateInsightArtifactRequest = (data: {
  title: string;
  sql: string;
}): CreateInsightArtifactRequestDto => ({
  title: data.title,
  sql: data.sql,
});

export const mapToUpdateInsightArtifactRequest = (data: {
  title: string;
  sql: string;
}): UpdateInsightArtifactRequestDto => ({
  title: data.title,
  sql: data.sql,
});
