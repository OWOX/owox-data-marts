import { DataMartConfigurationPreconditionDto } from './data-mart-configuration-precondition.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateDataMartTitleApiDto extends DataMartConfigurationPreconditionDto {
  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  title: string;
}
