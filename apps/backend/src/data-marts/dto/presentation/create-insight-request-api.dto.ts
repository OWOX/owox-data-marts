import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInsightRequestApiDto {
  @ApiProperty({ example: 'Analysis Q4 2025' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Template text with prompts', required: false })
  @IsString()
  @IsOptional()
  template?: string;
}
