import type { DestinationConfigDto } from './update-report.request.dto';

/**
 * DTO for creating a new report
 */
export interface CreateReportRequestDto {
  title: string;
  dataMartId: string;
  dataDestinationId: string;
  destinationConfig: DestinationConfigDto;
}
