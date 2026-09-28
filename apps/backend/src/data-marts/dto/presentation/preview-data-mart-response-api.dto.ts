import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DataMartPreviewColumnApiDto {
  @ApiProperty({ example: 'country' })
  name: string;

  @ApiPropertyOptional({ example: 'Country Name' })
  alias?: string;

  @ApiPropertyOptional({ example: 'STRING', description: 'Storage field type' })
  type?: string;
}

export class PreviewDataMartResponseApiDto {
  @ApiProperty({ type: [DataMartPreviewColumnApiDto] })
  columns: DataMartPreviewColumnApiDto[];

  @ApiProperty({
    description: 'Rows in column order; RECORD/ARRAY values are JSON text',
    type: 'array',
    items: { type: 'array', items: {} },
  })
  rows: (string | number | boolean | null)[][];

  @ApiProperty({ example: 10 })
  rowCount: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ description: 'More rows matched than the limit' })
  truncated: boolean;
}
