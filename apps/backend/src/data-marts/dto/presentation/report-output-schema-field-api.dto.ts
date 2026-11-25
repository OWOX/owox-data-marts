import { ApiProperty } from '@nestjs/swagger';
import {
  CALCULATED_FIELD_LEVELS,
  type CalculatedFieldLevel,
} from '../../calculated-fields/formula-level';
import type { ReportAggregateFunction } from '../schemas/aggregate-function.schema';

/** One column of a report's output, as a reader of the rows would name and understand it. */
export class ReportOutputSchemaFieldApiDto {
  @ApiProperty({
    description: 'Key each output row is keyed by',
    example: 'revenue | SUM',
  })
  name: string;

  @ApiProperty({
    description: 'Alias configured for the column; absent when there is none',
    example: 'Revenue, $ | SUM',
    required: false,
  })
  title?: string;

  @ApiProperty({
    description: 'Field description from the Data Mart schema, when the column has one',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Storage field type of the column, when known',
    example: 'NUMERIC',
    required: false,
  })
  type?: string;

  @ApiProperty({
    description:
      'The aggregate function the report applies to this column, when it applies one. Absent for a plain projected column.',
    example: 'SUM',
    required: false,
  })
  aggregateFunction?: string;

  @ApiProperty({
    description:
      "Set only for a calculated field, carrying the level its formula was derived to have. `metric` means the formula AGGREGATES: a query cannot aggregate it again, whatever `type` says; read `rollupAggregations` to combine its values. `column` means it is row-level and behaves like a column of its declared type, but no warehouse column backs it. Absent means an ordinary native column, which a consumer may treat as re-summable — so do not read an absent value as 'unknown'.",
    enum: CALCULATED_FIELD_LEVELS,
    required: false,
  })
  calculatedFieldLevel?: CalculatedFieldLevel;

  @ApiProperty({
    description:
      'Set only on a calculated metric column with no aggregateFunction. The functions that combine values this column computed for separate groups of rows into the value for all of them. [] means no function does: query the coarser grain.',
    enum: ['SUM', 'MIN', 'MAX'],
    isArray: true,
    required: false,
  })
  rollupAggregations?: ReportAggregateFunction[];
}
