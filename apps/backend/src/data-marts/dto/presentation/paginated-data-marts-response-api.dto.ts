import { ApiProperty } from '@nestjs/swagger';
import { DataMartListItemResponseApiDto } from './data-mart-list-item-response-api.dto';

export class PaginatedDataMartsResponseApiDto {
  @ApiProperty({ type: [DataMartListItemResponseApiDto] })
  items: DataMartListItemResponseApiDto[];

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({
    example: 50,
    nullable: true,
    description: 'Next offset to fetch, null if no more data',
  })
  nextOffset: number | null;
}
