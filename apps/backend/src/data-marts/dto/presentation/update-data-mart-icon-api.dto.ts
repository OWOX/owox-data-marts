import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { DataMartIcon } from '../../enums/data-mart-icon.enum';

export class UpdateDataMartIconApiDto {
  @ApiProperty({
    enum: DataMartIcon,
    required: false,
    nullable: true,
    description: 'Icon key from the fixed set; null resets the Data Mart to the default icon.',
  })
  @IsOptional()
  @IsEnum(DataMartIcon)
  icon: DataMartIcon | null;
}
