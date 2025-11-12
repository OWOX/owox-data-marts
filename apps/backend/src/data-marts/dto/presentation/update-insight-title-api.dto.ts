import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateInsightTitleApiDto {
  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  title: string;
}
