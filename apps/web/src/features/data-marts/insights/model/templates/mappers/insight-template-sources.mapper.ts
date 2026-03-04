import type { InsightTemplateSourceEntity } from '../types/insight-template-source.entity';
import type {
  InsightTemplateSourceListResponseDto,
  InsightTemplateSourceResponseDto,
} from '../types/insight-template-sources.dto';

export const mapInsightTemplateSourceFromDto = (
  dto: InsightTemplateSourceResponseDto
): InsightTemplateSourceEntity => ({
  id: dto.templateSourceId,
  key: dto.key,
  artifactId: dto.artifactId,
  title: dto.title,
  sql: dto.sql,
  validationStatus: dto.validationStatus,
  validationError: dto.validationError,
  createdById: dto.createdById,
  createdAt: new Date(dto.createdAt),
  modifiedAt: new Date(dto.modifiedAt),
});

export const mapInsightTemplateSourceListFromDto = (
  dto: InsightTemplateSourceListResponseDto
): InsightTemplateSourceEntity[] => dto.data.map(mapInsightTemplateSourceFromDto);
