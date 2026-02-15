import type { InsightTemplateEntity } from '../types/insight-template.entity';
import type {
  CreateInsightTemplateRequestDto,
  InsightTemplateListItemDto,
  InsightTemplateListResponseDto,
  InsightTemplateResponseDto,
  UpdateInsightTemplateRequestDto,
} from '../types/insight-templates.dto';

export const mapInsightTemplateFromDto = (
  dto: InsightTemplateResponseDto
): InsightTemplateEntity => ({
  id: dto.id,
  title: dto.title,
  template: dto.template,
  sources: dto.sources,
  sourcesCount: dto.sources.length,
  output: dto.output ?? null,
  outputUpdatedAt: dto.outputUpdatedAt ? new Date(dto.outputUpdatedAt) : null,
  lastRun: dto.lastManualDataMartRun
    ? { status: dto.lastManualDataMartRun.status, id: dto.lastManualDataMartRun.id }
    : null,
  createdById: dto.createdById,
  createdAt: new Date(dto.createdAt),
  modifiedAt: new Date(dto.modifiedAt),
});

export const mapInsightTemplateListItemFromDto = (
  dto: InsightTemplateListItemDto
): InsightTemplateEntity => ({
  id: dto.id,
  title: dto.title,
  template: null,
  sources: [],
  sourcesCount: dto.sourcesCount,
  output: null,
  outputUpdatedAt: dto.outputUpdatedAt ? new Date(dto.outputUpdatedAt) : null,
  lastRun: null,
  createdById: dto.createdById,
  createdAt: new Date(dto.createdAt),
  modifiedAt: new Date(dto.modifiedAt),
});

export const mapInsightTemplateListFromDto = (
  dto: InsightTemplateListResponseDto
): InsightTemplateEntity[] => dto.data.map(mapInsightTemplateListItemFromDto);

export const mapToCreateInsightTemplateRequest = (data: {
  title: string;
  template?: string | null;
  sources?: InsightTemplateEntity['sources'];
}): CreateInsightTemplateRequestDto => ({
  title: data.title,
  template: data.template ?? null,
  sources: data.sources ?? [],
});

export const mapToUpdateInsightTemplateRequest = (data: {
  title: string;
  template?: string | null;
  sources?: InsightTemplateEntity['sources'];
}): UpdateInsightTemplateRequestDto => ({
  title: data.title,
  template: data.template ?? null,
  sources: data.sources ?? [],
});
