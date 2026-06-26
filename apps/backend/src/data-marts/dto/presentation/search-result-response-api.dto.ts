import { ApiProperty } from '@nestjs/swagger';
import { SearchableEntityType } from '../../../common/search/search.facade';

export class SearchResultResponseApiDto {
  @ApiProperty({ enum: SearchableEntityType, example: SearchableEntityType.DATA_MART })
  entityType: SearchableEntityType;

  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  entityId: string;

  @ApiProperty({ example: 'Revenue by channel' })
  title: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Monthly revenue split by acquisition channel',
  })
  description: string | null;

  @ApiProperty({ example: 87, description: 'Combined relevance score' })
  finalScore: number;

  @ApiProperty({ example: 70, description: 'Keyword match score' })
  kwScore: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 92,
    description: 'Vector similarity score; null when no vector score contributed to the result',
  })
  vecScore: number | null;
}
