import { ApiProperty } from '@nestjs/swagger';
import { DataStorageType } from '../../enums/data-storage-type.enum';

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
  })
  credentials: Record<string, unknown> | undefined;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
  })
  config: Record<string, unknown> | undefined;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
