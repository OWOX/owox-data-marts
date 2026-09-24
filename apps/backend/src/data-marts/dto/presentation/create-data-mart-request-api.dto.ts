import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DataMartIcon } from '../../enums/data-mart-icon.enum';

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
    enum: DataMartIcon,
    required: false,
    nullable: true,
    description: 'Icon key from the fixed set; omit or null for the default icon.',
  })
  @IsOptional()
  @IsEnum(DataMartIcon)
  icon?: DataMartIcon | null;
}
