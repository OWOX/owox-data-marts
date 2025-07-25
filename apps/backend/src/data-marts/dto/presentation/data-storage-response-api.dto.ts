import { ApiProperty } from '@nestjs/swagger';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';

export type DataStorageCredentialsSafe =
  | {
      // BigQuery credentials
      type: 'service_account';
      project_id: string;
      client_id: string;
      client_email: string;
    }
  | {
      // Athena credentials
      accessKeyId: string;
    };

export class DataStorageResponseApiDto {
  @ApiProperty({ example: 'abc123e4-5678-90ab-cdef-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'title' })
  title: string;

  @ApiProperty({ enum: DataStorageType, example: DataStorageType.GOOGLE_BIGQUERY })
  type: DataStorageType;

  @ApiProperty({ example: 'my-project' })
  projectId: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Credentials with sensitive fields masked with * characters',
  })
  credentials: DataStorageCredentialsSafe | undefined;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
  })
  config: DataStorageConfig | undefined;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
