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

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}
