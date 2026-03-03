import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateInsightTemplateSourceRequestApiDto {
  @ApiProperty({ example: 'Projects created in 2025 (updated)', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example:
      "SELECT COUNT(1) AS value FROM projects WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'",
  })
  @IsString()
  @IsNotEmpty()
  sql: string;
}
