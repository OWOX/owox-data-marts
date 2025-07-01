import { DestinationTypeConfigEnum } from '../../enums';

/**
 * DTO for creating a new report
 */
export interface CreateReportRequestDto {
  title: string;
  dataMartId: string;
  dataDestinationId: string;
  destinationConfig: {
    type: DestinationTypeConfigEnum;
    spreadsheetId: string;
    sheetId: number;
  };
}
