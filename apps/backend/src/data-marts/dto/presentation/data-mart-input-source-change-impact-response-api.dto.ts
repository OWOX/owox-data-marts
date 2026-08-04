import { ApiProperty } from '@nestjs/swagger';

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
}
