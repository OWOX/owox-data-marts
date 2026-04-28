import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  IsOptional,
  IsUUID,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-types/data-storage-credentials.type';

export class UpdateDataStorageApiDto {
  @ApiProperty({
    type: 'string',
    description: 'Custom title for the data storage',
    required: true,
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255, { message: 'Title must be 255 characters or less' })
  title: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Credentials required for the selected storage type',
  })
  @IsObject()
  @IsOptional()
  credentials?: DataStorageCredentials;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Configuration specific to the storage type',
  })
  @IsObject()
  config: DataStorageConfig;

  @ApiProperty({ type: 'string', nullable: true, required: false })
  @IsUUID()
  @IsOptional()
  credentialId?: string | null;

  @ApiProperty({
    required: false,
    description: 'Source Storage ID to copy credentials from (mutually exclusive with credentials)',
    type: 'string',
  })
  @IsUUID()
  @IsOptional()
  sourceStorageId?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];

  @ApiProperty({
    required: false,
    description: 'Whether this storage is available for use by project members',
  })
  @IsOptional()
  @IsBoolean()
  availableForUse?: boolean;

  @ApiProperty({
    required: false,
    description: 'Whether this storage is available for maintenance by project members',
  })
  @IsOptional()
  @IsBoolean()
  availableForMaintenance?: boolean;

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Context IDs attached to this storage (full replacement)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contextIds?: string[];
}
