import { ApiProperty } from '@nestjs/swagger';
import { DataMartResponseApiDto } from './data-mart-response-api.dto';

export class PaginatedDataMartsResponseApiDto {
  @ApiProperty({ type: [DataMartResponseApiDto] })
  items: DataMartResponseApiDto[];

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({
    example: 50,
    nullable: true,
    description: 'Next offset to fetch, null if no more data',
  })
  nextOffset: number | null;
}
