import {
  ArrayMaxSize,
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsObject,
  IsArray,
  IsOptional,
  IsInt,
  IsPositive,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { SortConfig } from '../schemas/sort-config.schema';
import { AggregationConfig } from '../schemas/aggregation-config.schema';
import { DateTruncConfig } from '../schemas/date-trunc-config.schema';
import { UniqueCountConfig } from '../schemas/unique-count-config.schema';

export class UpdateReportRequestApiDto {
  @ApiProperty({ example: 'My Report' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'ID of the data destination' })
  @IsString()
  @IsNotEmpty()
  dataDestinationId: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Configuration for the data destination',
  })
  @IsObject()
  @IsNotEmpty()
  destinationConfig: DataDestinationConfig;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];

  @ApiProperty({
    description: 'Selected columns for the report (null = all native columns)',
    nullable: true,
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columnConfig?: ReportColumnConfig;

  @ApiProperty({
    description: 'Filter rules applied to the final SELECT (output filters)',
    nullable: true,
    required: false,
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  filterConfig?: FilterConfig | null;

  @ApiProperty({
    description: 'Sort rules (multi-column with order)',
    nullable: true,
    required: false,
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  sortConfig?: SortConfig | null;

  @ApiProperty({
    description: 'Row limit cap (no offset)',
    nullable: true,
    required: false,
    type: 'integer',
    minimum: 1,
    maximum: 10_000_000,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(10_000_000)
  limitConfig?: number | null;

  @ApiProperty({
    description: 'Aggregation rules applied to output columns',
    nullable: true,
    required: false,
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  aggregationConfig?: AggregationConfig | null;

  @ApiProperty({
    description: 'Date-trunc rules: bucket a date/timestamp dimension by a calendar unit',
    nullable: true,
    required: false,
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  dateTruncConfig?: DateTruncConfig | null;

  @ApiProperty({
    description: 'Unique Count config: count distinct primary-key tuples instead of all rows',
    nullable: true,
    required: false,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  uniqueCountConfig?: UniqueCountConfig;
}
