import type { InsightTemplateSourceDto } from '../../../shared/types/api/shared/data-mart-run-report-definition.dto';

export interface DataMartRunInsightTemplateDefinition {
  title: string;
  template: string | null;
  sources?: InsightTemplateSourceDto[] | null;
}
