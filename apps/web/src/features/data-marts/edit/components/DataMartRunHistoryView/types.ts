export interface DataMartRun {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  logs: string[];
  errors: string[];
  definitionRun: unknown;
}

export interface LogEntry {
  id: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'SYSTEM';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type LogViewType = 'structured' | 'raw' | 'configuration';
