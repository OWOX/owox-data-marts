import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateInsightRequestApiDto {
  @ApiProperty({ example: 'New Title for Analysis Q4 2025', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ example: 'New template text with prompts', required: false })
  @IsString()
  @IsOptional()
  template?: string;
}
