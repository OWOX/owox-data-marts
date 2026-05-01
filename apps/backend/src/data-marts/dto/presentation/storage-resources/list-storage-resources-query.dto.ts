import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { StorageResourceLevel } from '../../domain/list-storage-resources.command';

export class ListStorageResourcesQueryDto {
  @ApiProperty({
    enum: StorageResourceLevel,
    description: 'Tree level to load: namespaces | resources',
  })
  @IsEnum(StorageResourceLevel)
  level: StorageResourceLevel;

  @ApiPropertyOptional({
    description:
      'Top-level container ID (GCP project, Snowflake database, …). Required for level=resources.',
    example: 'my-gcp-project',
  })
  @ValidateIf(o => o.level === StorageResourceLevel.RESOURCES)
  @IsString()
  @IsNotEmpty()
  namespaceId?: string;

  @ApiPropertyOptional({
    enum: ['TABLE', 'VIEW', 'TABLE_PATTERN'],
    description:
      'Filter leaf resources by type. Only applies to level=resources. ' +
      'TABLE_PATTERN returns wildcard rollups for sharded tables (e.g. `events_*`).',
  })
  @IsOptional()
  @IsIn(['TABLE', 'VIEW', 'TABLE_PATTERN'])
  resourceType?: 'TABLE' | 'VIEW' | 'TABLE_PATTERN';
}
