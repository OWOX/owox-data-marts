import { DataMartListItemDto } from './data-mart-list-item.dto';

export interface PaginatedDataMartListItemsDto {
  items: DataMartListItemDto[];
  total: number;
  offset: number;
}
