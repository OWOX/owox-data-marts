import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDataMartRequestApiDto {
  @ApiProperty({ example: 'First Data Mart' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ enum: DataStorageType, example: DataStorageType.GOOGLE_BIGQUERY })
  @IsEnum(DataStorageType)
  storage: DataStorageType;
}
