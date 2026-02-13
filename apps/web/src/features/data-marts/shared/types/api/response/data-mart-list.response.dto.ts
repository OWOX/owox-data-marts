import type { DataMartResponseDto } from './data-mart.response.dto.ts';

/**
 * Data transfer object for paginated data mart list response
 */
export interface DataMartListResponseDto {
  items: DataMartResponseDto[];
  total: number;
  nextOffset: number | null;
}
