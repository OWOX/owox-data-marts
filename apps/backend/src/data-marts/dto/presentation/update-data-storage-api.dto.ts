import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';

export class UpdateDataStorageApiDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Credentials required for the selected storage type',
  })
  @IsObject()
  credentials: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Configuration specific to the storage type',
  })
  @IsObject()
  config: DataStorageConfig;
}
