import type { DestinationConfigDto } from './update-report.request.dto';
import type {
  AggregationRule,
  DateTruncRule,
  FilterRule,
  SortRule,
} from '../../../../shared/types/output-config';

/**
 * DTO for creating a new report
 */
export interface CreateReportRequestDto {
  title: string;
  dataMartId: string;
  dataDestinationId: string;
  destinationConfig: DestinationConfigDto;
  ownerIds?: string[];
  columnConfig?: string[] | null;
  filterConfig?: FilterRule[] | null;
  sortConfig?: SortRule[] | null;
  limitConfig?: number | null;
  aggregationConfig?: AggregationRule[] | null;
  dateTruncConfig?: DateTruncRule[] | null;
  uniqueCountConfig?: boolean | null;
}
