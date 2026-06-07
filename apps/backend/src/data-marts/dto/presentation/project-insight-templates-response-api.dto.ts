import { ApiProperty } from '@nestjs/swagger';
import { InsightTemplateListItemResponseApiDto } from './insight-template-list-item-response-api.dto';

export class ProjectInsightTemplateDataMartRefResponseApiDto {
  @ApiProperty({ example: 'a5c9b1d2-3456-7890-abcd-ef0123456789' })
  id: string;

  @ApiProperty({ example: 'Marketing performance' })
  title: string;
}

export class ProjectInsightTemplateResponseApiDto extends InsightTemplateListItemResponseApiDto {
  @ApiProperty({ type: ProjectInsightTemplateDataMartRefResponseApiDto })
  dataMart: ProjectInsightTemplateDataMartRefResponseApiDto;
}

export class ProjectInsightTemplatesResponseApiDto {
  @ApiProperty({ type: [ProjectInsightTemplateResponseApiDto] })
  insights: ProjectInsightTemplateResponseApiDto[];
}
