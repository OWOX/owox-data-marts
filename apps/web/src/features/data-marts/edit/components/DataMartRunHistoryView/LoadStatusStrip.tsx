import { useEffect, useMemo, useState } from 'react';
import { Calendar, Database } from 'lucide-react';
import type { LogEntry } from './types';
import { aggregateLoadStatus } from './load-status';
import { formatDuration } from '../../../../../utils/date-formatters';

interface LoadStatusStripProps {
  entries: LogEntry[];
  startedAt?: Date | null;
  finishedAt?: Date | null;
  isLive?: boolean;
}

export function LoadStatusStrip({
  entries,
  startedAt = null,
  finishedAt = null,
  isLive = false,
}: LoadStatusStripProps) {
  // Memoized so the live 1-second duration tick (below) doesn't re-scan
  // `entries` on every re-render — only recomputes when entries actually change.
  const status = useMemo(() => aggregateLoadStatus(entries), [entries]);
  // Tick every second while the run is live so the duration keeps counting up.
  const active = Boolean(status) && isLive && !finishedAt;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [active]);

  if (!status) return null;

  const duration = startedAt ? formatDuration(startedAt, finishedAt ?? new Date()) : null;

  return (
    <div
      data-testid='load-status-strip'
      className='bg-background border-border text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs'
    >
      <Database className='h-3.5 w-3.5 shrink-0' />
      {status.hasExtracted && (
        <>
          <span>
            Extracted{' '}
            <strong className='text-foreground'>{status.rowsExtracted.toLocaleString()}</strong>
          </span>
          <span aria-hidden='true'>·</span>
        </>
      )}
      <span>
        Loaded <strong className='text-foreground'>{status.rowsWritten.toLocaleString()}</strong>{' '}
        rows
      </span>
      {status.processingDate && (
        <>
          <span aria-hidden='true'>·</span>
          <span className='inline-flex items-center gap-1'>
            <Calendar className='h-3.5 w-3.5 shrink-0' />
            {status.processingDate}
          </span>
        </>
      )}
      {duration && (
        <>
          <span aria-hidden='true'>·</span>
          <span>{duration}</span>
        </>
      )}
    </div>
  );
}
