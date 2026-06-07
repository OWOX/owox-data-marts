import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ScheduledReportRunConfigType } from '../../scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';
import { ReportResponseApiDto } from './report-response-api.dto';

export const ScheduledConnectorRunConfigType = 'scheduled-connector-run-config';

export class ProjectScheduledReportRunConfigResponseApiDto {
  @ApiProperty({ example: ScheduledReportRunConfigType })
  type: typeof ScheduledReportRunConfigType;

  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  reportId: string;

  @ApiProperty({ type: ReportResponseApiDto, required: false })
  report?: ReportResponseApiDto;
}

export class ProjectScheduledConnectorRunConfigResponseApiDto {
  @ApiProperty({ example: ScheduledConnectorRunConfigType })
  type: typeof ScheduledConnectorRunConfigType;

  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: true,
    description: 'Masked connector definition used by the connector run target.',
  })
  connector?: unknown;
}

export type ProjectScheduledTriggerConfigResponseApiDto =
  | ProjectScheduledReportRunConfigResponseApiDto
  | ProjectScheduledConnectorRunConfigResponseApiDto;

export class ProjectScheduledTriggerDataMartRefResponseApiDto {
  @ApiProperty({ example: 'a5c9b1d2-3456-7890-abcd-ef0123456789' })
  id: string;

  @ApiProperty({ example: 'Marketing performance' })
  title: string;
}

@ApiExtraModels(
  ProjectScheduledReportRunConfigResponseApiDto,
  ProjectScheduledConnectorRunConfigResponseApiDto
)
export class ProjectScheduledTriggerResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ enum: ScheduledTriggerType, example: ScheduledTriggerType.CONNECTOR_RUN })
  type: ScheduledTriggerType;

  @ApiProperty({ example: '0 0 * * *' })
  cronExpression: string;

  @ApiProperty({ example: 'UTC' })
  timeZone: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z', nullable: true })
  nextRunTimestamp: Date | null;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z', nullable: true })
  lastRunTimestamp: Date | null;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ProjectScheduledReportRunConfigResponseApiDto) },
      { $ref: getSchemaPath(ProjectScheduledConnectorRunConfigResponseApiDto) },
    ],
    nullable: true,
    required: false,
  })
  triggerConfig?: ProjectScheduledTriggerConfigResponseApiDto;

  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  createdById: string;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;

  @ApiProperty({ type: UserProjectionDto, required: false, nullable: true })
  createdByUser?: UserProjectionDto | null;

  @ApiProperty({ type: ProjectScheduledTriggerDataMartRefResponseApiDto })
  dataMart: ProjectScheduledTriggerDataMartRefResponseApiDto;

  @ApiProperty({ example: true })
  canEdit: boolean;

  @ApiProperty({ example: true })
  canDelete: boolean;
}

export class ProjectScheduledTriggersResponseApiDto {
  @ApiProperty({ type: [ProjectScheduledTriggerResponseApiDto] })
  triggers: ProjectScheduledTriggerResponseApiDto[];
}
