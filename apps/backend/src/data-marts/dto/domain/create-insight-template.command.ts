import { InsightTemplateSources } from '../schemas/insight-template/insight-template-source.schema';

export class CreateInsightTemplateCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly template?: string,
    public readonly sources: InsightTemplateSources = []
  ) {}
}
