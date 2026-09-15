import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SearchableEntityType } from '../../../common/search/search.facade';

export class SearchReportDataMartRefResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'Orders' })
  title: string;
}

export class SearchReportDataDestinationRefResponseApiDto {
  @ApiProperty({ example: '2f1c5d0a-5678-4b1c-9d2e-fedcba654321' })
  id: string;

  @ApiProperty({ example: 'Finance Sheets' })
  title: string;

  @ApiProperty({ example: 'GOOGLE_SHEETS', description: 'Data destination type' })
  type: string;
}

export class SearchReportRefResponseApiDto {
  @ApiProperty({ type: SearchReportDataMartRefResponseApiDto })
  dataMart: SearchReportDataMartRefResponseApiDto;

  @ApiProperty({ type: SearchReportDataDestinationRefResponseApiDto })
  dataDestination: SearchReportDataDestinationRefResponseApiDto;
}

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

  @ApiPropertyOptional({
    type: SearchReportRefResponseApiDto,
    description: 'Data mart and destination of a REPORT result; absent for other entity types',
  })
  report?: SearchReportRefResponseApiDto;

  @ApiPropertyOptional({
    example: 'https://app.owox.com/ui/project-1/data-marts/dm-1/reports?reportId=rep-1',
    description: 'Canonical direct URL of a REPORT result; absent for other entity types',
  })
  url?: string;
}
