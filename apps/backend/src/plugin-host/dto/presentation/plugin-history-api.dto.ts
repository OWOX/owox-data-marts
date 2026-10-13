import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  PLUGIN_HISTORY_DEFAULT_LIMIT,
  type PluginHistoryType,
} from '../../dto/domain/list-plugin-history.command';
import { PluginAuditAction } from '../../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';

const HISTORY_TYPES: PluginHistoryType[] = ['all', 'installations', 'publications'];
const HISTORY_ACTIONS = Object.values(PluginAuditAction).filter(
  action => action !== PluginAuditAction.UPDATE_CHECK
);

export class ListPluginHistoryQueryApiDto {
  @ApiPropertyOptional({ enum: HISTORY_TYPES, default: 'all' })
  @IsOptional()
  @IsIn(HISTORY_TYPES)
  type?: PluginHistoryType;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: PLUGIN_HISTORY_DEFAULT_LIMIT,
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
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'nextCursor of the previous page.' })
  @IsOptional()
  @IsUUID('all')
  cursor?: string;
}

export class PluginHistoryPluginApiDto {
  @ApiProperty() pluginId: string;
  @ApiProperty() displayName: string;
  @ApiProperty() ownerName: string;
}

export class PluginHistoryActorApiDto {
  @ApiProperty({ enum: ['you', 'member', 'deployment'] }) kind: 'you' | 'member' | 'deployment';
  @ApiPropertyOptional({ description: 'Set for kind member only.' }) name?: string;
}

export class PluginHistoryEventApiDto {
  @ApiProperty() id: string;
  @ApiProperty({ format: 'date-time' }) occurredAt: string;
  @ApiProperty({ enum: HISTORY_ACTIONS }) action: string;
  @ApiProperty({
    enum: PluginPublicationScope,
    nullable: true,
    description: 'Set for publish and unpublish only.',
  })
  scope: PluginPublicationScope | null;
  @ApiProperty({ type: PluginHistoryPluginApiDto }) plugin: PluginHistoryPluginApiDto;
  @ApiProperty({
    type: PluginHistoryActorApiDto,
    nullable: true,
    description:
      'Null when the actor is not disclosed: an automatic update, or someone outside this project.',
  })
  actor: PluginHistoryActorApiDto | null;
  @ApiProperty({ type: String, nullable: true, description: 'The version an update made current.' })
  version: string | null;
}

export class PluginHistoryPageApiDto {
  @ApiProperty({ type: [PluginHistoryEventApiDto] }) items: PluginHistoryEventApiDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
