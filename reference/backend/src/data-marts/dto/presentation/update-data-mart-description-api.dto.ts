import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateDataMartDescriptionApiDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf(obj => obj.description !== null)
  @IsString()
  @MinLength(1)
  description: string;
}
