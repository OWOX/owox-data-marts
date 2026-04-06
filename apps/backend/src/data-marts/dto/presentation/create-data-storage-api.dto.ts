import { ApiProperty } from '@nestjs/swagger';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDataStorageApiDto {
  @ApiProperty({ enum: DataStorageType })
  @IsEnum(DataStorageType)
  type: DataStorageType;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];
}
