import type { DataMartDefinitionConfig } from './data-mart-definition-config';
import type { DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunReportDefinition } from './data-mart-run-report-definition';
import type { DataMartRunInsightDefinition } from './data-mart-run-insight-definition';
import type { DataMartRunInsightTemplateDefinition } from './data-mart-run-insight-template-definition';
import type { DataMartRunAiAssistantDefinition } from './data-mart-run-ai-assistant-definition.ts';
import { DataMartRunStatus } from '../../../shared';
import type { UserProjection } from '../../../../../shared/types';

export interface DataMartRunItem {
  id: string;
  status: DataMartRunStatus;
  createdAt: Date;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfig;
  type: DataMartRunType;
  triggerType: DataMartRunTriggerType;
  startedAt: Date | null;
  finishedAt: Date | null;
  reportDefinition: DataMartRunReportDefinition | null;
  reportId: string | null;
  insightDefinition: DataMartRunInsightDefinition | null;
  insightId: string | null;
  insightTemplateDefinition: DataMartRunInsightTemplateDefinition | null;
  insightTemplateId: string | null;
  aiAssistantDefinition: DataMartRunAiAssistantDefinition | null;
  createdByUser: UserProjection | null;
  additionalParams: Record<string, unknown> | null;
  /** Grand-totals summary (numeric fields plus report-aggregated metrics × allowed
   * aggregations, excluding ANY_VALUE/STRING_AGG); values may be numbers or strings; null when
   * none. */
  totals: Record<string, number | string | boolean | null> | null;
}

export interface DataMartRunDataMartRef {
  id: string;
  title: string;
}

export interface ProjectDataMartRunItem extends DataMartRunItem {
  dataMart: DataMartRunDataMartRef;
}
