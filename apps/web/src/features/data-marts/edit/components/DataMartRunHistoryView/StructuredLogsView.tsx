import { useEffect, useRef } from 'react';
import type { LogEntry } from './types';
import { LogSeverity } from './log-category';
import { categoryLabel } from './log-category';
import { getCategoryIcon, getCategoryColor } from './icons';

interface StructuredLogsViewProps {
  logs: LogEntry[];
  isLive?: boolean;
  newestFirst?: boolean;
}

const OWOX_APP_URL = 'https://app.owox.com';

const renderMessage = (message: string) =>
  message.split(/(https:\/\/app\.owox\.com)/g).map((part, index) =>
    part === OWOX_APP_URL ? (
      <a
        key={`${part}-${String(index)}`}
        href={part}
        target='_blank'
        rel='noopener noreferrer'
        className='underline'
      >
        {part}
      </a>
    ) : (
      part
    )
  );

export function StructuredLogsView({
  logs,
  isLive = false,
  newestFirst = false,
}: StructuredLogsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Pinned to the tail edge: bottom for oldest-first, top for newest-first.
  // Kept in a ref so scroll events don't trigger re-renders.
  const atEdgeRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atEdgeRef.current = newestFirst
      ? el.scrollTop < 24
      : el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const getDisplayTimestamp = (logEntry: LogEntry): string => {
    if (logEntry.metadata?.at) {
      return logEntry.metadata.at as string;
    }
    return logEntry.timestamp;
  };

  useEffect(() => {
    if (!isLive) return;
    const el = scrollRef.current;
    if (el && atEdgeRef.current) {
      el.scrollTop = newestFirst ? 0 : el.scrollHeight;
    }
  }, [logs, isLive, newestFirst]);

  if (logs.length === 0) {
    return (
      <div className='bg-background border-border rounded-lg border'>
        <div className='text-muted-foreground p-8 text-center text-sm'>No logs found</div>
      </div>
    );
  }

  return (
    <div className='bg-background border-border rounded-lg border'>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid='structured-logs-scroll'
        className='max-h-96 overflow-y-auto'
      >
        {logs.map((logEntry, index) => (
          <div
            key={logEntry.id}
            className={`border-border hover:bg-accent/30 flex items-start gap-3 border-b p-3 text-xs ${
              index === logs.length - 1 ? 'border-b-0' : ''
            } ${logEntry.severity === LogSeverity.MUTED ? 'opacity-70' : ''}`}
            onClick={handleStopPropagation}
          >
            <div className='text-muted-foreground flex-shrink-0 font-mono text-xs'>
              {getDisplayTimestamp(logEntry)}
            </div>
            <div className='flex min-w-0 flex-shrink-0 items-center gap-2'>
              {getCategoryIcon(logEntry.category)}
              <span className={`text-xs font-medium ${getCategoryColor(logEntry.category)}`}>
                {categoryLabel(logEntry.category)}
              </span>
            </div>
            <div
              className={`min-w-0 flex-1 text-xs break-words ${
                logEntry.severity === LogSeverity.ERROR
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-foreground'
              }`}
            >
              {logEntry.message.includes('\n') ? (
                <pre className='font-mono text-xs whitespace-pre-wrap'>
                  {renderMessage(logEntry.message)}
                </pre>
              ) : (
                <span>{renderMessage(logEntry.message)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
