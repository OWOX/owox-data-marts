import type { DataMartDefinitionConfig } from './data-mart-definition-config';
import type { DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { DataMartRunReportDefinition } from './data-mart-run-report-definition';
import { DataMartRunStatus } from '../../../shared';

export interface DataMartRunItem {
  id: string;
  status: DataMartRunStatus;
  createdAt: Date;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfig | null;
  type: DataMartRunType | null;
  triggerType: DataMartRunTriggerType | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  reportDefinition: DataMartRunReportDefinition | null;
}
