import { ReportStatusEnum } from '../../enums';
import type { DataMartResponseDto } from '../../../../shared';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';
import type { DestinationConfigDto } from './update-report.request.dto';

/**
 * DTO for report response from the API
 */
export interface ReportResponseDto {
  id: string;
  title: string;
  dataMart: DataMartResponseDto;
  dataDestinationAccess: DataDestinationResponseDto;
  destinationConfig: DestinationConfigDto;
  lastRunAt: string | null;
  lastRunStatus: ReportStatusEnum | null;
  lastRunError: string | null;
  runsCount: number;
  createdAt: string;
  modifiedAt: string;
}
