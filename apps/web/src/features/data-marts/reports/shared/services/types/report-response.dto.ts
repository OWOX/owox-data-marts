import { ReportStatusEnum } from '../../enums';
import { DestinationTypeConfigEnum } from '../../enums';
import type { DataMartResponseDto } from '../../../../shared';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';

/**
 * DTO for report response from the API
 */
export interface ReportResponseDto {
  id: string;
  title: string;
  dataMart: DataMartResponseDto;
  dataDestinationAccess: DataDestinationResponseDto;
  destinationConfig: {
    type: DestinationTypeConfigEnum;
    spreadsheetId: string;
    sheetId: number;
  };
  lastRunAt: string | null;
  lastRunStatus: ReportStatusEnum | null;
  lastRunError: string | null;
  runsCount: number;
  createdAt: string;
  modifiedAt: string;
}
