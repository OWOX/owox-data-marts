import { DestinationTypeConfigEnum } from '../../enums';

/**
 * DTO for updating an existing report
 */
export interface UpdateReportRequestDto {
  title: string;
  dataDestinationId: string;
  destinationConfig: {
    type: DestinationTypeConfigEnum;
    spreadsheetId: string;
    sheetId: number;
  };
}
