import type { LogEntry } from './types';
import { LogLevel } from './types';
import { getDisplayType } from './utils';
import { getLogLevelIcon, getLogLevelColor } from './icons';

interface StructuredLogsViewProps {
  logs: LogEntry[];
}

export function StructuredLogsView({ logs }: StructuredLogsViewProps) {
  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const getDisplayTimestamp = (logEntry: LogEntry): string => {
    if (logEntry.metadata?.at) {
      return logEntry.metadata.at as string;
    }
    return logEntry.timestamp;
  };

  if (logs.length === 0) {
    return (
      <div className='bg-background border-border rounded-lg border'>
        <div className='text-muted-foreground p-8 text-center'>No logs found</div>
      </div>
    );
  }

  return (
    <div className='bg-background border-border rounded-lg border'>
      <div className='max-h-96 overflow-y-auto'>
        {logs.map((logEntry, index) => (
          <div
            key={logEntry.id}
            className={`border-border hover:bg-accent/30 flex items-start gap-3 border-b p-3 text-sm text-xs ${
              index === logs.length - 1 ? 'border-b-0' : ''
            }`}
            onClick={handleStopPropagation}
          >
            <div className='text-muted-foreground flex-shrink-0 font-mono text-xs'>
              {getDisplayTimestamp(logEntry)}
            </div>
            <div className='flex min-w-0 flex-shrink-0 items-center gap-2'>
              {getLogLevelIcon(logEntry.level)}
              <span className={`text-xs font-medium ${getLogLevelColor(logEntry.level)}`}>
                {getDisplayType(logEntry)}
              </span>
            </div>
            <div
              className={`min-w-0 flex-1 text-xs break-words ${
                logEntry.level === LogLevel.ERROR
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-foreground'
              }`}
            >
              {logEntry.message.includes('\n') ? (
                <pre className={`font-mono text-xs whitespace-pre-wrap`}>{logEntry.message}</pre>
              ) : (
                <span>{logEntry.message}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
