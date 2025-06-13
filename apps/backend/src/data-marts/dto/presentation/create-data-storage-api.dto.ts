import { ApiProperty } from '@nestjs/swagger';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { IsEnum } from 'class-validator';

export class CreateDataStorageApiDto {
  @ApiProperty({ enum: DataStorageType })
  @IsEnum(DataStorageType)
  type: DataStorageType;
}
