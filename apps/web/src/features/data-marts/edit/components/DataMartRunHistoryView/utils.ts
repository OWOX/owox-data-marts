import type { LogEntry } from './types';
import { LogLevel } from './types';
import type { DataMartDefinitionConfig } from '../../model/types/data-mart-definition-config';
import { formatDateTime, parseDate } from '../../../../../utils/date-formatters';
import type { DataMartRunItem } from '../../model';
import { DataMartRunTriggerType, DataMartRunType } from '../../../shared';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';

/**
 * Format timestamp string to display format
 * Parses the timestamp and formats it in browser's local timezone
 */
const formatTimestamp = (timestamp: string): string => {
  return formatDateTime(parseDate(timestamp).toISOString());
};

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
        timestamp: formatTimestamp(timestamp),
        level: isError ? LogLevel.ERROR : LogLevel.INFO,
        message: processedMessage.message,
        metadata: {
          at: processedMessage.metadata?.at
            ? formatTimestamp(processedMessage.metadata.at as string)
            : formatTimestamp(timestamp),
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
      timestamp: formatTimestamp(structuredMatch[1]),
      level: isError ? LogLevel.ERROR : (structuredMatch[2] as LogLevel),
      message: processedMessage.message,
      metadata: processedMessage.metadata?.at
        ? {
            ...processedMessage.metadata,
            at: formatTimestamp(processedMessage.metadata.at as string),
          }
        : processedMessage.metadata,
    };
  }

  // Fallback for simple logs
  const processedMessage = processJSONMessage(log);
  return {
    id: `log-${index.toString()}`,
    timestamp: formatTimestamp(new Date().toISOString()),
    level: isError ? LogLevel.ERROR : LogLevel.INFO,
    message: processedMessage.message,
    metadata: processedMessage.metadata?.at
      ? {
          ...processedMessage.metadata,
          at: formatTimestamp(processedMessage.metadata.at as string),
        }
      : processedMessage.metadata,
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

export const getDisplayType = (logEntry: LogEntry): string => {
  if (logEntry.metadata?.type) {
    return logEntry.metadata.type as string;
  }
  return logEntry.level;
};

export const getRunSummary = (run: DataMartRunItem, connectorInfo: ConnectorListItem | null) => {
  const triggerType = run.triggerType === DataMartRunTriggerType.SCHEDULED ? 'scheduled' : 'manual';

  let title = '';
  let runType = '';
  switch (run.type) {
    case DataMartRunType.CONNECTOR:
      // TODO: Add config identity
      title = connectorInfo?.displayName ?? '';
      runType = 'connector';
      break;
    case DataMartRunType.LOOKER_STUDIO:
      title = 'Looker Studio data fetching';
      runType = 'report';
      break;
    case DataMartRunType.GOOGLE_SHEETS_EXPORT:
      title = run.reportDefinition?.title ?? '';
      runType = 'report';
      break;
    default:
      break;
  }

  let runDescription = `${triggerType} ${runType} run`.trim();
  runDescription = runDescription.slice(0, 1).toUpperCase() + runDescription.slice(1);

  const parts = [runDescription, title];

  return parts.join(' • ');
};

export const downloadLogs = (run: {
  id: string;
  logs: string[];
  errors: string[];
  definitionRun: DataMartDefinitionConfig | null;
}) => {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `datamart-run-${run.id.slice(0, 8)}-logs.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const getStartedAtDisplay = (run: DataMartRunItem): string => {
  const resolvedDate = run.startedAt ?? run.createdAt;
  return formatDateTime(resolvedDate.toISOString());
};

export const getTooltipContent = (run: DataMartRunItem) => {
  const startedAt = run.startedAt ? formatDateTime(run.startedAt.toISOString()) : 'N/A';
  const finishedAt = run.finishedAt ? formatDateTime(run.finishedAt.toISOString()) : 'N/A';

  let duration = '';
  if (run.startedAt && run.finishedAt) {
    const durationMs = run.finishedAt.getTime() - run.startedAt.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${String(hours)} h`);
    if (remainingMinutes > 0) parts.push(`${String(remainingMinutes)} min`);
    parts.push(`${String(remainingSeconds)} sec`);

    duration = parts.join(' ');
  }

  return {
    startedAt,
    finishedAt,
    duration,
  };
};
