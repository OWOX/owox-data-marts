import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PluginActionExecutionStatus } from '../../enums/plugin-action-execution-status.enum';
import { PluginScheduleDisabledReason } from '../../enums/plugin-action-schedule.enum';

export class PluginScheduleLastRunApiDto {
  @ApiProperty() executionId: string;

  @ApiProperty({ enum: PluginActionExecutionStatus })
  status: PluginActionExecutionStatus;

  @ApiProperty({ type: String, nullable: true }) errorCode: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) finishedAt: string | null;
}

export class MemberPluginScheduleApiDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: String, nullable: true }) name: string | null;
  @ApiProperty() action: string;

  @ApiProperty({ description: 'Five fields, or six with seconds; runs at most once a minute.' })
  cron: string;

  @ApiProperty({ description: 'The IANA time zone the cron expression is read in.' })
  timeZone: string;

  @ApiProperty({ description: 'False while Paused or Disabled.' })
  enabled: boolean;

  @ApiProperty({ enum: PluginScheduleDisabledReason, nullable: true })
  disabledReason: PluginScheduleDisabledReason | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Null while Paused or Disabled, or while the installation is uninstalled.',
  })
  nextRunAt: string | null;

  @ApiProperty({ type: PluginScheduleLastRunApiDto, nullable: true })
  lastRun: PluginScheduleLastRunApiDto | null;

  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) modifiedAt: string;
}

export class PluginScheduleApiDto extends MemberPluginScheduleApiDto {
  @ApiProperty({ description: 'The input each run starts the action with.' })
  parameters: unknown;
}

export class CreatePluginScheduleApiDto {
  @ApiProperty({ description: 'A backend action declared by the current version.' })
  action: string;

  @ApiPropertyOptional({
    description:
      'Checked against the action input schema. Absent means null. At most 64 KiB as JSON.',
  })
  parameters?: unknown;

  @ApiProperty({ maxLength: 255 }) cron: string;

  @ApiProperty({ maxLength: 64, description: 'An IANA time zone, for example Europe/Kyiv.' })
  timeZone: string;

  @ApiPropertyOptional({ default: true, description: 'False creates a Paused schedule.' })
  enabled?: boolean;

  @ApiPropertyOptional({ maxLength: 200 }) name?: string;
}

export class UpdatePluginScheduleApiDto {
  @ApiPropertyOptional() action?: string;

  @ApiPropertyOptional({ description: 'Replaces the parameters; null clears them.' })
  parameters?: unknown;

  @ApiPropertyOptional({ maxLength: 255 }) cron?: string;
  @ApiPropertyOptional({ maxLength: 64 }) timeZone?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 200,
    description: 'Null clears it.',
  })
  name?: string | null;
}

export class PluginScheduleListApiDto {
  @ApiProperty({ type: [PluginScheduleApiDto] }) schedules: PluginScheduleApiDto[];
}
