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
    enum: ['TABLE', 'VIEW'],
    description: 'Filter leaf resources by type. Only applies to level=resources.',
  })
  @IsOptional()
  @IsIn(['TABLE', 'VIEW'])
  resourceType?: 'TABLE' | 'VIEW';
}
