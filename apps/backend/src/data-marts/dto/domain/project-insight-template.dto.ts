import { InsightTemplateDto } from './insight-template.dto';

export interface ProjectInsightTemplateDataMartRefDto {
  readonly id: string;
  readonly title: string;
}

export class ProjectInsightTemplateDto {
  constructor(
    public readonly insightTemplate: InsightTemplateDto,
    public readonly dataMart: ProjectInsightTemplateDataMartRefDto
  ) {}
}
