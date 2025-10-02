import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength, IsOptional } from 'class-validator';
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
  credentials: DataStorageCredentials;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Configuration specific to the storage type',
  })
  @IsObject()
  config: DataStorageConfig;
}
