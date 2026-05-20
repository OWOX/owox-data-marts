import { ApiProperty } from '@nestjs/swagger';
import { DataMartResponseApiDto } from './data-mart-response-api.dto';
import { DataDestinationResponseApiDto } from './data-destination-response-api.dto';
import { ReportRunStatus } from '../../enums/report-run-status.enum';
import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { SortConfig } from '../schemas/sort-config.schema';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

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

  @ApiProperty({ nullable: true, required: false, type: [String] })
  columnConfig?: ReportColumnConfig;

  @ApiProperty({ nullable: true, required: false, description: 'Filter rules' })
  filterConfig?: FilterConfig | null;

  @ApiProperty({ nullable: true, required: false, description: 'Sort rules' })
  sortConfig?: SortConfig | null;

  @ApiProperty({ nullable: true, required: false, description: 'Row limit', type: Number })
  limitConfig?: number | null;

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

  @ApiProperty({ type: UserProjectionDto, required: false, nullable: true })
  createdByUser?: UserProjectionDto | null;

  @ApiProperty({ type: [UserProjectionDto] })
  ownerUsers: UserProjectionDto[];

  @ApiProperty({ example: true, description: 'Whether the caller can manually run this report' })
  canRun: boolean;

  @ApiProperty({
    example: true,
    description:
      'Whether the caller can create / edit / delete report triggers. Equal to canRun today.',
  })
  canManageTriggers: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether the caller can edit the report configuration (columns, filters, owners, destination)',
  })
  canEditConfig: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether the caller can view the generated SQL for this report',
  })
  canViewSql: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the caller can copy this report as a new DataMart',
  })
  canCopyAsDataMart: boolean;
}
