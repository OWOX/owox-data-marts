import type { LogCategory, LogSeverity } from './log-category';

export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SYSTEM = 'SYSTEM',
}

export enum LogViewType {
  STRUCTURED = 'structured',
  RAW = 'raw',
  CONFIGURATION = 'configuration',
}

export type SortDir = 'asc' | 'desc';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  category: LogCategory;
  severity: LogSeverity;
  metadata?: Record<string, string | number | boolean | null>;
  sortTime?: number;
}
