import type { DataMartListItemResponseDto } from './data-mart-list-item.response.dto.ts';

/**
 * Data transfer object for paginated data mart list response
 */
export interface DataMartListResponseDto {
  items: DataMartListItemResponseDto[];
  total: number;
  nextOffset: number | null;
}
