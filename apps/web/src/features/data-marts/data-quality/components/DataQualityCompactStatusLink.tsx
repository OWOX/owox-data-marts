import { cn } from '@owox/ui/lib/utils';
import { Link } from 'react-router-dom';
import { formatDateShort } from '../../../../utils/date-formatters';
import {
  DATA_QUALITY_STATUS_TEXT_CLASSES,
  getDataQualityStatusVisual,
} from '../../shared/utils/data-quality-status';
import type { DataQualityStatusLabel } from '../../shared/utils/data-quality-status';
import { useLatestDataQualityRun } from '../model/use-data-quality-workspace';
import type { DataQualityCompactSummary, DataQualityRun } from '../model/types';

interface DataQualityCompactStatusLinkProps {
  projectId: string;
  dataMartId: string;
  summary?: DataQualityCompactSummary | null;
}

const BORDER_CLASSES = {
  neutral: 'border-muted-foreground/30',
  progress: 'border-brand-blue-500/40',
  success: 'border-green-500/40',
  warning: 'border-amber-500/50',
  error: 'border-red-500/40',
  notice: 'border-muted-foreground/40',
} as const;

const COMPACT_STATUS_LABELS: Record<DataQualityStatusLabel, string> = {
  'Never run': 'Data Quality has not been checked yet',
  'All checks disabled': 'Data Quality checks are disabled',
  'No applicable checks': 'No applicable Data Quality checks',
  Queued: 'Data Quality check queued',
  Running: 'Data Quality check running',
  Passed: 'Data Quality checks passed',
  'Issues found': 'Data Quality issues found',
  'Run failed': 'Data Quality check failed',
  Cancelled: 'Data Quality check cancelled',
};

function getRunTimestamp(latestRun: DataQualityRun | null | undefined): string | null {
  if (!latestRun) return null;
  if (latestRun.summary.state === 'QUEUED') return latestRun.createdAt;
  if (latestRun.summary.state === 'RUNNING') return latestRun.startedAt ?? latestRun.createdAt;
  return latestRun.finishedAt ?? latestRun.startedAt ?? latestRun.createdAt;
}

export function DataQualityCompactStatusLink({
  projectId,
  dataMartId,
  summary,
}: DataQualityCompactStatusLinkProps) {
  const { data: latestRun } = useLatestDataQualityRun(projectId, dataMartId);
  const currentSummary = latestRun?.summary ?? summary;
  const statusVisual = getDataQualityStatusVisual(currentSummary ?? { state: 'NEVER_RUN' });
  const statusLabel = COMPACT_STATUS_LABELS[statusVisual.label];
  const Icon = statusVisual.icon;
  const checkedAt = latestRun ? getRunTimestamp(latestRun) : (summary?.lastRunAt ?? null);
  const timeLabel =
    currentSummary?.state === 'QUEUED'
      ? 'Requested'
      : currentSummary?.state === 'RUNNING'
        ? 'Started'
        : 'Last checked';

  return (
    <div
      className={cn(
        'mb-4 flex items-center justify-between gap-3 rounded-md border p-3',
        BORDER_CLASSES[statusVisual.tone]
      )}
    >
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <Icon
          className={cn(
            'size-5 shrink-0',
            DATA_QUALITY_STATUS_TEXT_CLASSES[statusVisual.tone],
            currentSummary?.state === 'RUNNING' && 'animate-spin'
          )}
          aria-hidden='true'
        />
        <div className='flex min-w-0 items-baseline gap-2 overflow-hidden'>
          <span className='min-w-0 truncate text-sm font-medium' title={statusLabel}>
            {statusLabel}
          </span>
          {checkedAt && (
            <span className='text-muted-foreground inline-flex shrink-0 items-center gap-2 text-xs whitespace-nowrap'>
              <span aria-hidden='true'>·</span>
              <span>
                {timeLabel} {formatDateShort(checkedAt)}
              </span>
            </span>
          )}
        </div>
      </div>
      <Link
        to={`/ui/${projectId}/data-marts/${dataMartId}/quality`}
        aria-label={`Open Data Quality: ${statusLabel}`}
        className='text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center text-sm font-medium hover:underline'
      >
        Open
      </Link>
    </div>
  );
}
