import type { DataMartDefinitionConfig } from './data-mart-definition-config';

export interface DataMartRunItem {
  id: string;
  status: string;
  createdAt: string;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfig | null;
}

export interface DataMartRun {
  runs: DataMartRunItem[];
}
