import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInsightRequestApiDto {
  @ApiProperty({ example: 'New Title for Analysis Q4 2025', required: true, maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'New template text with prompts', required: false })
  @IsString()
  @IsOptional()
  template?: string;
}
