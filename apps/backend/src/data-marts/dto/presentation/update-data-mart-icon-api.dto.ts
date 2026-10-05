import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import {
  DATA_MART_ICON_API_DESCRIPTION,
  DATA_MART_ICON_MAX_LENGTH,
  DATA_MART_ICON_PATTERN,
  type DataMartIconValue,
} from '../../enums/data-mart-icon.enum';

export class UpdateDataMartIconApiDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'purchases',
    description: `${DATA_MART_ICON_API_DESCRIPTION} null resets the Data Mart to the default icon.`,
  })
  // Required: a body without `icon` is a client mistake, not a reset — only an explicit null resets.
  @ValidateIf(obj => obj.icon !== null)
  @IsString()
  @MaxLength(DATA_MART_ICON_MAX_LENGTH)
  @Matches(DATA_MART_ICON_PATTERN)
  icon: DataMartIconValue | null;
}
