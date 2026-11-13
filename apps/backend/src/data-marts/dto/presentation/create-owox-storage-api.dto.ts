import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OWOX_STORAGE_LOCATIONS } from '../../owox-storage/owox-storage-settings';
import type { OwoxStorageLocation } from '../../owox-storage/owox-storage-settings';

export class CreateOwoxStorageApiDto {
  @ApiProperty({ minLength: 1, maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: OWOX_STORAGE_LOCATIONS })
  @IsIn(OWOX_STORAGE_LOCATIONS)
  location: OwoxStorageLocation;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];
}
