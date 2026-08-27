import { ApiProperty } from '@nestjs/swagger';

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
}
