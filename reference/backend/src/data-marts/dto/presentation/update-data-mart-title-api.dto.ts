import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateDataMartTitleApiDto {
  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  title: string;
}
