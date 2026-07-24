import { ApiProperty } from '@nestjs/swagger';
import { DataMartListItemResponseApiDto } from './data-mart-list-item-response-api.dto';

export class PaginatedDataMartsResponseApiDto {
  @ApiProperty({ type: [DataMartListItemResponseApiDto] })
  items: DataMartListItemResponseApiDto[];

  @ApiProperty({ type: 'integer', example: 120, minimum: 0 })
  total: number;

  @ApiProperty({
    type: 'integer',
    example: 50,
    minimum: 0,
    nullable: true,
    description: 'Next offset to fetch, null if no more data',
  })
  nextOffset: number | null;
}
