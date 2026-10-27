import { ApiProperty } from '@nestjs/swagger';

export class DataMartImpactItemApiDto {
  @ApiProperty({ example: '96c33880-70e3-4151-9a07-ae379c994898' })
  id: string;

  @ApiProperty({ example: 'Retail orders' })
  title: string;
}

export class DataMartInputSourceChangeImpactResponseApiDto {
  @ApiProperty({
    example: 2,
    description: 'Relationships where this DataMart joins another one',
  })
  outboundRelationshipsCount: number;

  @ApiProperty({
    example: 3,
    description: 'Relationships where another DataMart joins this one',
  })
  inboundRelationshipsCount: number;

  @ApiProperty({ example: 5, description: 'Reports built on this DataMart' })
  reportsCount: number;

  @ApiProperty({
    example: 2,
    description:
      'SQL DataMarts whose query references this DataMart, including ones the caller cannot see',
  })
  referencingDataMartsCount: number;

  @ApiProperty({
    type: [DataMartImpactItemApiDto],
    description:
      'The referencing DataMarts the caller can see, by title. Fewer than referencingDataMartsCount when some are hidden from the caller.',
  })
  referencingDataMarts: DataMartImpactItemApiDto[];
}
