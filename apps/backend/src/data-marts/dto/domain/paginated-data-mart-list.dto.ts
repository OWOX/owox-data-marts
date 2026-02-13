import { DataMartDto } from './data-mart.dto';

export interface PaginatedDataMartListDto {
  items: DataMartDto[];
  total: number;
  offset: number;
}
