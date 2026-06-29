import { ReportStatusEnum } from '../../enums';
import type { DataMartResponseDto } from '../../../../shared';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';
import type { DestinationConfigDto } from './update-report.request.dto';
import type { UserProjection } from '../../../../../../shared/types';
import type {
  AggregationRule,
  DateTruncRule,
  FilterRule,
  SortRule,
} from '../../../../shared/types/output-config';

/**
 * DTO for report response from the API
 */
export interface ReportResponseDto {
  id: string;
  title: string;
  dataMart: DataMartResponseDto;
  dataDestinationAccess: DataDestinationResponseDto;
  destinationConfig: DestinationConfigDto;
  columnConfig?: string[] | null;
  filterConfig?: FilterRule[] | null;
  sortConfig?: SortRule[] | null;
  limitConfig?: number | null;
  aggregationConfig?: AggregationRule[] | null;
  dateTruncConfig?: DateTruncRule[] | null;
  uniqueCountConfig?: boolean | null;
  lastRunAt: string | null;
  lastRunStatus: ReportStatusEnum | null;
  lastRunError: string | null;
  runsCount: number;
  createdAt: string;
  modifiedAt: string;
  createdByUser?: UserProjection | null;
  ownerUsers?: UserProjection[];
  canRun: boolean;
  canManageTriggers: boolean;
  canEditConfig: boolean;
}
