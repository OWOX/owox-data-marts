import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateInsightTemplateSourceRequestApiDto {
  @ApiProperty({ example: 'projects_2025', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key: string;

  @ApiProperty({ example: 'Projects created in 2025', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example: 'SELECT COUNT(*) AS value FROM projects WHERE EXTRACT(YEAR FROM created_at) = 2025',
  })
  @IsString()
  @IsNotEmpty()
  sql: string;
}
