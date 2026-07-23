import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { OwnerFilter } from '../../enums/owner-filter.enum';

export class ListDataMartsQueryApiDto {
  @ApiPropertyOptional({
    type: 'integer',
    description: 'Number of visible Data Marts to skip before returning the next page',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || typeof value === 'number') {
      return value;
    }
    return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  })
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    enum: OwnerFilter,
    description: 'Filter by whether a Data Mart has business or technical owners',
  })
  @IsOptional()
  @IsEnum(OwnerFilter)
  ownerFilter?: OwnerFilter;
}
