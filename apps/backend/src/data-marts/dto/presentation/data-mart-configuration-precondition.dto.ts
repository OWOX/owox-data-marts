import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DataMartConfigurationPreconditionDto {
  @ApiPropertyOptional({
    description: 'Configuration revision to compare before writing',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision?: number;
}
