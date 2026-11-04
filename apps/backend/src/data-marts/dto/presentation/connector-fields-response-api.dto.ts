import { ApiProperty } from '@nestjs/swagger';

export class ConnectorFieldResponseApiDto {
  @ApiProperty({ example: 'field_name' })
  name: string;

  @ApiProperty({ example: 'Field Type', required: false })
  type?: string;

  @ApiProperty({ example: 'Field Description', required: false })
  description?: string;
}

export class ConnectorFieldsResponseApiDto {
  @ApiProperty({ example: 'field_name' })
  name: string;

  @ApiProperty({ example: 'Field Overview', required: false })
  overview?: string;

  @ApiProperty({ example: 'Field Description', required: false })
  description?: string;

  @ApiProperty({ example: 'Field Documentation', required: false })
  documentation?: string;

  @ApiProperty({ example: ['field1', 'field2'], required: false })
  defaultFields?: string[];

  @ApiProperty({
    example: true,
    required: false,
    description:
      'Whether the node is fetched by date window. A node without it loads the whole catalog regardless of dates, so a manual backfill runs it once.',
  })
  isTimeSeries?: boolean;

  @ApiProperty({ example: 'Field Fields', required: false })
  fields?: ConnectorFieldResponseApiDto[];
}
