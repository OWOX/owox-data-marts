import type { InsightEntity } from '../types';
import type {
  CreateInsightRequestDto,
  InsightListResponseDto,
  InsightResponseDto,
  UpdateInsightRequestDto,
} from '../types';

export const mapInsightFromDto = (dto: InsightResponseDto): InsightEntity => ({
  id: dto.id,
  title: dto.title,
  template: dto.template ?? null,
  createdAt: dto.createdAt,
  modifiedAt: dto.modifiedAt,
});

export const mapInsightListFromDto = (dto: InsightListResponseDto): InsightEntity[] =>
  dto.data.map(mapInsightFromDto);

export const mapToCreateInsightRequest = (data: {
  title: string;
  template?: string | null;
}): CreateInsightRequestDto => ({
  title: data.title,
  template: data.template ?? null,
});

export const mapToUpdateInsightRequest = (data: {
  title: string;
  template?: string | null;
}): UpdateInsightRequestDto => ({
  title: data.title,
  template: data.template ?? null,
});
