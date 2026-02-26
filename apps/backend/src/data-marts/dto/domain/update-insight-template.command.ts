import { InsightTemplateSources } from '../schemas/insight-template/insight-template-source.schema';

export class UpdateInsightTemplateCommand {
  constructor(
    public readonly insightTemplateId: string,
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly title?: string,
    public readonly template?: string,
    public readonly sources?: InsightTemplateSources
  ) {}
}
