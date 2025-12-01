import { capitalizeFirstLetter } from '../../../../../utils';
import {
  formatDateTime,
  formatDuration,
  formatTimestamp,
} from '../../../../../utils/date-formatters';
import { DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../../model';
import type { DataMartDefinitionConfig } from '../../model/types/data-mart-definition-config';
import type { LogEntry } from './types';
import { LogLevel } from './types';

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
    timestamp: 'N/A',
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

export const getRunSummaryParts = (
  run: DataMartRunItem,
  connectorDisplayName: string | null | undefined
) => {
  let title = '';
  let runType = '';
  switch (run.type) {
    case DataMartRunType.CONNECTOR:
      title = connectorDisplayName ?? '';
      runType = 'connector';
      break;
    case DataMartRunType.LOOKER_STUDIO:
      title = 'Looker Studio data fetching';
      runType = 'report';
      break;
    case DataMartRunType.GOOGLE_SHEETS_EXPORT:
    case DataMartRunType.EMAIL:
    case DataMartRunType.SLACK:
    case DataMartRunType.MS_TEAMS:
    case DataMartRunType.GOOGLE_CHAT:
      title = run.reportDefinition?.title ?? '';
      runType = 'report';
      break;
    case DataMartRunType.INSIGHT:
      title = run.insightDefinition?.title ?? '';
      runType = 'insight';
      break;
    default:
      break;
  }

  const runDescription = capitalizeFirstLetter(`${run.triggerType} ${runType} run`.trim());

  return [runDescription, title];
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
  const startedAt = formatDateForTooltipContent(run.startedAt);
  const finishedAt = formatDateForTooltipContent(run.finishedAt);

  let duration = '';
  if (run.startedAt && run.finishedAt) {
    duration = formatDuration(run.startedAt, run.finishedAt);
  }

  return {
    startedAt,
    finishedAt,
    duration,
  };
};

export const formatDateForTooltipContent = (date: Date | null): string => {
  return date ? formatDateTime(date.toISOString()) : 'N/A';
};
