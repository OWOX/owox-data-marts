import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  DATA_MART_ICON_API_DESCRIPTION,
  DATA_MART_ICON_MAX_LENGTH,
  DATA_MART_ICON_PATTERN,
  type DataMartIconValue,
} from '../../enums/data-mart-icon.enum';

export class CreateDataMartRequestApiDto {
  @ApiProperty({ example: 'First Data Mart' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storageId: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    example: 'purchases',
    description: `${DATA_MART_ICON_API_DESCRIPTION} Omit or null for the default icon.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(DATA_MART_ICON_MAX_LENGTH)
  @Matches(DATA_MART_ICON_PATTERN)
  icon?: DataMartIconValue | null;
}
