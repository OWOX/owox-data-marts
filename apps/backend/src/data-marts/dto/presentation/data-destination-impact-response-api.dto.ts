import { ApiProperty } from '@nestjs/swagger';

export class DataDestinationImpactResponseApiDto {
  @ApiProperty({ example: 'abc123e4-5678-90ab-cdef-1234567890ab' })
  destinationId: string;

  @ApiProperty({ example: 'My Google Sheets Destination' })
  destinationTitle: string;

  @ApiProperty({
    example: 5,
    description: 'Total number of reports referencing this destination.',
  })
  reportsCount: number;

  @ApiProperty({
    example: 3,
    description: 'Number of distinct data marts whose reports reference this destination.',
  })
  dataMartCount: number;
}
