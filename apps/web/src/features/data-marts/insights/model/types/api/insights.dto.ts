export interface InsightResponseDto {
  id: string;
  title: string;
  template?: string | null;
  createdById: number;
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
