import { ReportStatusEnum } from '../../enums';
import type { DataMartResponseDto } from '../../../../shared';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';
import type { DestinationConfigDto } from './update-report.request.dto';
import type { UserProjection } from '../../../../../../shared/types';

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
  lastRunAt: string | null;
  lastRunStatus: ReportStatusEnum | null;
  lastRunError: string | null;
  runsCount: number;
  createdAt: string;
  modifiedAt: string;
  createdByUser?: UserProjection | null;
}
