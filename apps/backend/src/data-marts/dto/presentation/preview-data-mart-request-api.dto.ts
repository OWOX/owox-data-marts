import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, Max, Min } from 'class-validator';
import { FilterConfig } from '../schemas/filter-config.schema';
import { SortConfig } from '../schemas/sort-config.schema';
import { PREVIEW_MAX_LIMIT } from '../../use-cases/preview-data-mart.service';

export class PreviewDataMartRequestApiDto {
  @ApiPropertyOptional({
    description: 'How many rows to read from the warehouse. Defaults to 10.',
    minimum: 1,
    maximum: PREVIEW_MAX_LIMIT,
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PREVIEW_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'WHERE filters on native fields, in the same rule format as a report filterConfig.',
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  filters?: FilterConfig;

  @ApiPropertyOptional({
    description: 'ORDER BY rules on native fields, in the same format as a report sortConfig.',
    type: 'array',
    items: { type: 'object' },
    example: [{ column: 'revenue', direction: 'desc' }],
  })
  @IsOptional()
  @IsArray()
  sort?: SortConfig;
}
