import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RunInsightArtifactSqlPreviewRequestApiDto {
  @ApiPropertyOptional({
    description: 'Optional SQL override. If omitted, saved artifact SQL is executed.',
    example: 'SELECT * FROM table LIMIT 10',
  })
  @IsOptional()
  @IsString()
  sql?: string;
}
