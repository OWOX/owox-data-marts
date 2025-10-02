import type {
  DataMartDefinitionConfig,
  DataMartDefinitionConfigDto,
} from './data-mart-definition-config';
import { RunStatus } from '../../components/DataMartRunHistoryView/types';

export interface DataMartRunItemDto {
  id: string;
  status: string;
  createdAt: string;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfigDto | null;
}

export interface DataMartRunItem {
  id: string;
  status: RunStatus;
  createdAt: Date;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfig | null;
}

export interface DataMartRunDto {
  runs: DataMartRunItemDto[];
}

export interface DataMartRun {
  runs: DataMartRunItem[];
}
