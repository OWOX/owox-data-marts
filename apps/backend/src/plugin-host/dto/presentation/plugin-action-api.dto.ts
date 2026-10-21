import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Allow, IsInt, IsOptional } from 'class-validator';
import { PLUGIN_ACTION_LIMITS } from '../../constants/plugin-action-limits';
import {
  PluginActionExecutionStatus,
  type PluginActionTrigger,
} from '../../enums/plugin-action-execution-status.enum';
import type { PluginCredentialHandleDto } from '../domain/plugin-installation.dto';

export class StartPluginActionExecutionApiDto {
  @ApiPropertyOptional({
    description:
      'Checked against the action input schema. Absent means null. At most 256 KiB as JSON.',
  })
  @Allow()
  input?: unknown;
}

const { maxWaitSeconds } = PLUGIN_ACTION_LIMITS;

export class PluginActionExecutionQueryApiDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    default: 0,
    description: `Holds the answer until the execution ends or the time passes. Above ${maxWaitSeconds}, ${maxWaitSeconds} is used.`,
  })
  @IsOptional()
  // Clamped rather than refused, so the cap can change without breaking published SDKs.
  @Transform(({ value }) => {
    if (value === undefined) return value;
    return typeof value === 'string' && /^\d+$/.test(value)
      ? Math.min(Number(value), maxWaitSeconds)
      : Number.NaN;
  })
  @IsInt({ message: 'waitSeconds must be a whole number of seconds' })
  waitSeconds?: number;
}

export class StartedPluginActionExecutionApiDto {
  @ApiProperty() id: string;

  @ApiProperty({ enum: [PluginActionExecutionStatus.RUNNING] })
  status: PluginActionExecutionStatus.RUNNING;
}

export class PluginActionExecutionErrorApiDto {
  @ApiProperty({
    description:
      "The failure code for FAILED, set by the plugin's backend or by OWOX (`BACKEND_*`), or the status for CANCELLED and TIMED_OUT.",
  })
  code: string;

  @ApiProperty() message: string;
}

export class PluginActionExecutionApiDto {
  @ApiProperty() id: string;
  @ApiProperty() action: string;

  @ApiProperty({
    enum: PluginActionExecutionStatus,
    description:
      'QUEUED: a scheduled run waits for a start limit; it has no startedAt or deadlineAt yet.',
  })
  status: PluginActionExecutionStatus;

  @ApiProperty({ enum: ['frontend', 'schedule'] })
  trigger: PluginActionTrigger;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The schedule that started the execution; null for a start from the plugin page.',
  })
  scheduleId: string | null;

  @ApiProperty({ type: Date, nullable: true }) startedAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) deadlineAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) finishedAt: Date | null;

  @ApiProperty({ description: 'SUCCEEDED only. Cleared 24 hours after the execution ends.' })
  result: unknown;

  @ApiProperty({
    type: PluginActionExecutionErrorApiDto,
    nullable: true,
    description: 'FAILED, CANCELLED and TIMED_OUT only.',
  })
  error: PluginActionExecutionErrorApiDto | null;
}

export class PluginActionWorkerPluginApiDto {
  @ApiProperty() id: string;

  @ApiProperty({
    description:
      'The GitHub repository id of the plugin, the same on every deployment and after a rename or transfer.',
  })
  repositoryId: string;
}

export class PluginActionWorkerContextApiDto {
  @ApiProperty() executionId: string;
  @ApiProperty() action: string;

  @ApiProperty({ description: 'The input the execution was started with.' })
  input: unknown;

  @ApiProperty({ enum: ['frontend', 'schedule'] })
  trigger: PluginActionTrigger;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The schedule that started the execution; null for a start from the plugin page.',
  })
  scheduleId: string | null;

  @ApiProperty() deadlineAt: Date;

  @ApiProperty({ type: PluginActionWorkerPluginApiDto })
  plugin: PluginActionWorkerPluginApiDto;

  @ApiProperty({ description: 'Semver of the release the execution started on.' })
  pluginVersion: string;

  @ApiProperty() installationId: string;
  @ApiProperty() projectId: string;
  @ApiProperty() userId: string;

  @ApiProperty({
    type: [Object],
    description:
      "Handles for the exact Credentials of the plugin's current release. AI Credentials are not available in a backend action.",
  })
  credentialHandles: PluginCredentialHandleDto[];
}
