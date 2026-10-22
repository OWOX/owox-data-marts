import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import {
  PluginActionExecutionStatus,
  type PluginActionTrigger,
} from '../../enums/plugin-action-execution-status.enum';
import { PLUGIN_RUNS_DEFAULT_LIMIT } from '../domain/plugin-run.command';

const STATUSES = Object.values(PluginActionExecutionStatus);
const TRIGGERS: PluginActionTrigger[] = ['frontend', 'schedule'];

export class ListPluginRunsQueryApiDto {
  @ApiPropertyOptional({ description: 'nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: PLUGIN_RUNS_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || typeof value === 'number') {
      return value;
    }
    return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  })
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    enum: STATUSES,
    isArray: true,
    description: 'Repeat the key for several: status=FAILED&status=TIMED_OUT.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: PluginActionExecutionStatus[];

  @ApiPropertyOptional({ enum: TRIGGERS })
  @IsOptional()
  @IsIn(TRIGGERS)
  trigger?: PluginActionTrigger;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all')
  pluginId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all')
  scheduleId?: string;

  @ApiPropertyOptional({ description: 'The owner to narrow to; honoured for project admins only.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userId?: string;
}

export class PluginRunApiDto {
  @ApiProperty() id: string;
  @ApiProperty() pluginId: string;
  @ApiProperty({ description: "The current version's display name." }) pluginName: string;

  @ApiProperty({ type: String, nullable: true, description: 'The semver the run used.' })
  pluginVersion: string | null;

  @ApiProperty() action: string;
  @ApiProperty({ enum: STATUSES }) status: PluginActionExecutionStatus;
  @ApiProperty({ enum: TRIGGERS }) trigger: PluginActionTrigger;
  @ApiProperty({ type: String, nullable: true }) scheduleId: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Null once the schedule is deleted.' })
  scheduleName: string | null;

  @ApiProperty({ type: UserProjectionDto, nullable: true }) owner: UserProjectionDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) queuedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) startedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) finishedAt: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Null before the run starts.' })
  timeLimitSeconds: number | null;

  @ApiProperty({ type: String, nullable: true }) errorCode: string | null;
  @ApiProperty({ type: String, nullable: true }) errorMessage: string | null;

  @ApiProperty({ description: "True once the 24-hour sweep cleared the plugin's own message." })
  errorMessageCleared: boolean;

  @ApiProperty({ description: 'True for the owner or a project admin while Queued or Running.' })
  canCancel: boolean;
}

export class PluginRunListApiDto {
  @ApiProperty({ type: [PluginRunApiDto] }) items: PluginRunApiDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
