import type { DataMartDefinitionConfigDto } from '../../model/types/data-mart-definition-config';

export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SYSTEM = 'SYSTEM',
}

export enum RunStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  INTERRUPTED = 'INTERRUPTED',
}

export enum LogViewType {
  STRUCTURED = 'structured',
  RAW = 'raw',
  CONFIGURATION = 'configuration',
}

export interface DataMartRun {
  id: string;
  status: RunStatus;
  createdAt: string;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfigDto | null;
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}
