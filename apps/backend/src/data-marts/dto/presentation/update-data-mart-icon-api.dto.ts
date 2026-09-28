import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, ValidateIf } from 'class-validator';
import { DataMartIcon } from '../../enums/data-mart-icon.enum';

export class UpdateDataMartIconApiDto {
  @ApiProperty({
    enum: DataMartIcon,
    nullable: true,
    description: 'Icon key from the fixed set; null resets the Data Mart to the default icon.',
  })
  // Required: a body without `icon` is a client mistake, not a reset — only an explicit null resets.
  @ValidateIf(obj => obj.icon !== null)
  @IsEnum(DataMartIcon)
  icon: DataMartIcon | null;
}
