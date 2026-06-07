import type { InsightTemplateEntity } from '../types/insight-template.entity';
import type {
  CreateInsightTemplateRequestDto,
  InsightTemplateListItemDto,
  InsightTemplateListResponseDto,
  ProjectInsightTemplateListItemDto,
  ProjectInsightTemplateListResponseDto,
  InsightTemplateResponseDto,
  UpdateInsightTemplateRequestDto,
} from '../types/insight-templates.dto';
import type { ProjectInsightTemplateEntity } from '../types/insight-template.entity';

export const mapInsightTemplateFromDto = (
  dto: InsightTemplateResponseDto
): InsightTemplateEntity => ({
  id: dto.id,
  title: dto.title,
  template: dto.template,
  sources: [],
  sourcesCount: 0,
  lastRenderedTemplate: dto.lastRenderedTemplate ?? null,
  lastRenderedTemplateUpdatedAt: dto.lastRenderedTemplateUpdatedAt
    ? new Date(dto.lastRenderedTemplateUpdatedAt)
    : null,
  lastRun: dto.lastManualDataMartRun
    ? {
        status: dto.lastManualDataMartRun.status,
        id: dto.lastManualDataMartRun.id,
      }
    : null,
  createdById: dto.createdById,
  createdAt: new Date(dto.createdAt),
  modifiedAt: new Date(dto.modifiedAt),
  createdByUser: dto.createdByUser,
});

export const mapInsightTemplateListItemFromDto = (
  dto: InsightTemplateListItemDto
): InsightTemplateEntity => ({
  id: dto.id,
  title: dto.title,
  template: null,
  sources: [],
  sourcesCount: dto.sourcesCount,
  lastRenderedTemplate: null,
  lastRenderedTemplateUpdatedAt: dto.lastRenderedTemplateUpdatedAt
    ? new Date(dto.lastRenderedTemplateUpdatedAt)
    : null,
  lastRun: null,
  createdById: dto.createdById,
  createdAt: new Date(dto.createdAt),
  modifiedAt: new Date(dto.modifiedAt),
  createdByUser: dto.createdByUser,
});

export const mapInsightTemplateListFromDto = (
  dto: InsightTemplateListResponseDto
): InsightTemplateEntity[] => dto.data.map(mapInsightTemplateListItemFromDto);

export const mapProjectInsightTemplateListItemFromDto = (
  dto: ProjectInsightTemplateListItemDto
): ProjectInsightTemplateEntity => ({
  ...mapInsightTemplateListItemFromDto(dto),
  dataMart: {
    id: dto.dataMart.id,
    title: dto.dataMart.title,
  },
});

export const mapProjectInsightTemplateListFromDto = (
  dto: ProjectInsightTemplateListResponseDto
): ProjectInsightTemplateEntity[] => dto.insights.map(mapProjectInsightTemplateListItemFromDto);

export const mapToCreateInsightTemplateRequest = (data: {
  title: string;
  template?: string | null;
}): CreateInsightTemplateRequestDto => ({
  title: data.title,
  template: data.template ?? null,
});

export const mapToUpdateInsightTemplateRequest = (data: {
  title: string;
  template?: string | null;
}): UpdateInsightTemplateRequestDto => ({
  title: data.title,
  template: data.template ?? null,
});
