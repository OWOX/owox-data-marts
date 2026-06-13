import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SearchableEntityType } from '../../../common/ee-contracts/advanced-search.facade';

export class AdvancedSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map(v => v.trim())
          .filter(v => v.length > 0)
      : value
  )
  @IsEnum(SearchableEntityType, { each: true })
  entityTypes?: SearchableEntityType[];
}
