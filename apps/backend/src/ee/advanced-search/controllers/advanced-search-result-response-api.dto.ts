import { ApiProperty } from '@nestjs/swagger';
import { SearchableEntityType } from '../../../common/ee-contracts/advanced-search.facade';

export class AdvancedSearchResultResponseApiDto {
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

  @ApiProperty({ example: 87, description: 'Combined relevance + extendability score' })
  finalScore: number;

  @ApiProperty({ example: 70, description: 'Keyword match score (0-100)' })
  kwScore: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 92,
    description: 'Vector similarity score (0-100); null when embeddings are unavailable',
  })
  vecScore: number | null;

  @ApiProperty({ example: 30, description: 'Graph extendability bonus' })
  extendability: number;
}
