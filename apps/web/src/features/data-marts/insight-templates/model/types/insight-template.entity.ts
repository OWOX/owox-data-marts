import type { DataMartRunItem } from '../../../edit/model/types/data-mart-run';
import type { InsightTemplateSourceDto } from './insight-templates.dto';

export interface InsightTemplateEntity {
  id: string;
  title: string;
  template: string | null;
  sources: InsightTemplateSourceDto[];
  sourcesCount?: number;
  lastRenderedTemplate: string | null;
  lastRenderedTemplateUpdatedAt: Date | null;
  lastRun: Pick<DataMartRunItem, 'status' | 'id'> | null;
  createdById: string;
  createdAt: Date;
  modifiedAt: Date;
}
