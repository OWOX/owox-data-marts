import { DataMartRunDto } from './data-mart-run.dto';
import { InsightTemplateSources } from '../schemas/insight-template/insight-template-source.schema';

export class InsightTemplateDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly template: string | null,
    public readonly sources: InsightTemplateSources,
    public readonly output: string | null,
    public readonly outputUpdatedAt: Date | null,
    public readonly createdById: string,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly lastManualDataMartRun: DataMartRunDto | null
  ) {}
}
