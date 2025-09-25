import type { LogEntry } from './types';
import { LogLevel } from './types';
import type { DataMartDefinitionConfigDto } from '../../model/types/data-mart-definition-config';

export const parseLogEntry = (log: string, index: number, isError = false): LogEntry => {
  // Split log into lines for multiline format
  const lines = log.split('\n').filter(line => line.trim() !== '');

  if (lines.length >= 3) {
    // Format: timestamp\ntype\nmessage
    const timestamp = lines[0];
    const type = lines[1];
    const message = lines.slice(2).join('\n');

    // Check if timestamp looks like ISO format
    if (timestamp.includes('T') && timestamp.includes('Z')) {
      // Try to parse message as JSON to extract type and at
      const processedMessage = processJSONMessage(message);

      return {
        id: `log-${index.toString()}`,
        timestamp: timestamp,
        level: isError ? LogLevel.ERROR : LogLevel.INFO,
        message: processedMessage.message,
        metadata: {
          at: processedMessage.metadata?.at ?? timestamp,
          type: processedMessage.metadata?.type ?? (type !== 'unknown' ? type : null),
        },
      };
    }
  }

  const structuredMatch = /^\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/.exec(log);
  if (structuredMatch) {
    const processedMessage = processJSONMessage(structuredMatch[3]);

    return {
      id: `log-${index.toString()}`,
      timestamp: structuredMatch[1],
      level: isError ? LogLevel.ERROR : (structuredMatch[2] as LogLevel),
      message: processedMessage.message,
      metadata: processedMessage.metadata,
    };
  }

  // Fallback for simple logs
  const processedMessage = processJSONMessage(log);
  return {
    id: `log-${index.toString()}`,
    timestamp: new Date().toISOString(),
    level: isError ? LogLevel.ERROR : LogLevel.INFO,
    message: processedMessage.message,
    metadata: processedMessage.metadata,
  };
};

export const processJSONMessage = (
  message: string
): { message: string; metadata?: Record<string, string | number | boolean | null> } => {
  try {
    const parsed = JSON.parse(message) as Record<string, string | number | boolean | null>;

    if (typeof parsed === 'object') {
      const metadata: Record<string, string | number | boolean | null> = {};
      const processedObj = { ...parsed } as Record<string, string | number | boolean | null>;

      // Extract type and at fields
      if ('type' in processedObj) {
        metadata.type = processedObj.type as string;
        delete processedObj.type;
      }

      if ('at' in processedObj) {
        metadata.at = processedObj.at as string;
        delete processedObj.at;
      }

      // If only one field remains, show it as plain text
      const remainingKeys = Object.keys(processedObj);
      if (remainingKeys.length === 1) {
        const key = remainingKeys[0];
        const value = processedObj[key] as string;
        return {
          message: typeof value === 'string' ? value : JSON.stringify(value),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
      }

      // If multiple fields remain, show as JSON
      return {
        message: JSON.stringify(processedObj, null, 2),
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    }
  } catch {
    // Not valid JSON, return as is
  }

  return { message };
};

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const getDisplayTimestamp = (logEntry: LogEntry): string => {
  if (logEntry.metadata?.at) {
    return formatDate(logEntry.metadata.at as string);
  }
  return formatDate(logEntry.timestamp);
};

export const getDisplayType = (logEntry: LogEntry): string => {
  if (logEntry.metadata?.type) {
    return logEntry.metadata.type as string;
  }
  return logEntry.level;
};

export const getRunSummary = (run: { id: string; logs: string[]; errors: string[] }) => {
  const logCount = run.logs.length;
  const errorCount = run.errors.length;
  const totalMessages = logCount + errorCount;

  const parts = [`Run #${run.id.slice(-8)}`, `${String(totalMessages)} messages`];

  if (errorCount > 0) {
    parts.push(`${String(errorCount)} errors`);
  }

  return parts.join(' • ');
};

export const downloadLogs = (run: {
  id: string;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfigDto | null;
}) => {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `datamart-run-${run.id.slice(0, 8)}-logs.json`;
  a.click();
  URL.revokeObjectURL(url);
};
