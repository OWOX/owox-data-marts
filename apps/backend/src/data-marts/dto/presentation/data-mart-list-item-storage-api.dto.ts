import { ApiProperty } from '@nestjs/swagger';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';

export class DataMartListItemStorageApiDto {
  @ApiProperty({ enum: DataStorageType, example: DataStorageType.GOOGLE_BIGQUERY })
  type: DataStorageType;

  @ApiProperty({ example: 'My Storage', nullable: true })
  title: string;
}
