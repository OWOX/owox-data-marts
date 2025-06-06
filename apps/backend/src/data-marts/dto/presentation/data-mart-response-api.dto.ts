import { ApiProperty } from '@nestjs/swagger';
import { DataStorageType } from '../../enums/data-storage-type.enum';

export class DataMartResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'First Data Mart' })
  title: string;

  @ApiProperty({ enum: DataStorageType, example: DataStorageType.GOOGLE_BIGQUERY })
  storageType: DataStorageType;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
