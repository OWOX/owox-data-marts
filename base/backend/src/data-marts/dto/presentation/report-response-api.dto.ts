import { ApiProperty } from '@nestjs/swagger';
import { DataMartResponseApiDto } from './data-mart-response-api.dto';
import { DataDestinationResponseApiDto } from './data-destination-response-api.dto';
import { ReportRunStatus } from '../../enums/report-run-status.enum';
import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';

export class ReportResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'My Report' })
  title: string;

  @ApiProperty()
  dataMart: DataMartResponseApiDto;

  @ApiProperty()
  dataDestinationAccess: DataDestinationResponseApiDto;

  @ApiProperty()
  destinationConfig: DataDestinationConfig;

  @ApiProperty({ nullable: true })
  lastRunAt?: Date;

  @ApiProperty({ enum: ReportRunStatus, nullable: true })
  lastRunStatus?: ReportRunStatus;

  @ApiProperty({ nullable: true })
  lastRunError?: string;

  @ApiProperty({ example: 0 })
  runsCount: number;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
