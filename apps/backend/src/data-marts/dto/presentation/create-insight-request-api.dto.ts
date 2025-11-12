import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInsightRequestApiDto {
  @ApiProperty({ example: 'Analysis Q4 2025', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'Template text with prompts', required: false })
  @IsString()
  @IsOptional()
  template?: string;
}
