import { ApiProperty } from '@nestjs/swagger';

export class InsightArtifactSqlPreviewResponseApiDto {
  @ApiProperty({
    description: 'Column names in output table',
    type: [String],
    example: ['column1', 'column2'],
  })
  columns: string[];

  @ApiProperty({
    description: 'Rows represented as arrays aligned with columns table',
    type: 'array',
    items: {
      type: 'array',
      items: {
        nullable: true,
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      },
    },
    example: [
      ['purchase', 42],
      ['signup', 8],
    ],
  })
  rows: unknown[][];

  @ApiProperty({
    description: 'Number of rows returned',
    example: 2,
  })
  rowCount: number;

  @ApiProperty({
    description: 'Maximum number of rows returned in preview',
    example: 10,
  })
  limit: number;
}
