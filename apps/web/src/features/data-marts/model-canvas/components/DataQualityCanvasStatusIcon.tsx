import { LoaderCircle, Play } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@owox/ui/components/hover-card';
import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { DataQualityCompactSummary } from '../../shared/types';
import {
  DATA_QUALITY_STATUS_TEXT_CLASSES,
  getDataQualityStatusVisual,
} from '../../shared/utils/data-quality-status';
import { formatDateShort } from '../../../../utils/date-formatters';

interface DataQualityCanvasStatusIconProps {
  dataMartTitle: string;
  summary: DataQualityCompactSummary;
  onOpenQuality: () => void;
  onRunQuality: () => Promise<void>;
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function DataQualityCanvasStatusIcon({
  dataMartTitle,
  summary,
  onOpenQuality,
  onRunQuality,
}: DataQualityCanvasStatusIconProps) {
  const [isStartingQuality, setIsStartingQuality] = useState(false);
  const presentation = getDataQualityStatusVisual(summary);
  const Icon = presentation.icon;
  const actionLabel = `Open Data Quality for ${dataMartTitle}: ${presentation.label}`;
  const isActive = presentation.isActive;
  const timeLabel =
    summary.state === 'QUEUED'
      ? 'Queued'
      : summary.state === 'RUNNING'
        ? 'Started'
        : 'Last checked';

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    onOpenQuality();
  }

  async function handleRunQualityClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    if (isActive || isStartingQuality) return;

    setIsStartingQuality(true);
    try {
      await onRunQuality();
    } finally {
      setIsStartingQuality(false);
    }
  }

  return (
    <HoverCard openDelay={100} closeDelay={200}>
      <HoverCardTrigger asChild>
        <button
          type='button'
          className={`${DATA_QUALITY_STATUS_TEXT_CLASSES[presentation.tone]} -ml-0.5 inline-flex shrink-0 cursor-pointer rounded p-0.5 transition-colors`}
          aria-label={actionLabel}
          onPointerDown={event => {
            event.stopPropagation();
          }}
          onClick={handleClick}
        >
          <Icon
            className={`size-4 ${summary.state === 'RUNNING' ? 'animate-spin' : ''}`}
            aria-hidden={true}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side='top'
        align='center'
        role='region'
        aria-label={`Data Quality checks for ${dataMartTitle}`}
        className='w-72 max-w-72 p-3 text-xs sm:w-72 sm:max-w-72'
        onPointerDown={event => {
          event.stopPropagation();
        }}
      >
        <div className='border-border flex items-center justify-between gap-3 border-b pb-2'>
          <h2 className='text-sm font-semibold whitespace-nowrap'>Data Quality checks</h2>
          <span
            className={`${DATA_QUALITY_STATUS_TEXT_CLASSES[presentation.tone]} shrink-0 font-medium whitespace-nowrap`}
          >
            {presentation.label}
          </span>
        </div>
        <div className='text-muted-foreground space-y-1 py-2'>
          {summary.enabledChecks > 0 && <p>{summary.enabledChecks} enabled</p>}
          {isActive ? (
            <p>Terminal results will be available after this run finishes.</p>
          ) : (
            <>
              {summary.passedChecks > 0 && <p>{summary.passedChecks} passed</p>}
              {summary.failedChecks > 0 && <p>{summary.failedChecks} failed</p>}
              {summary.notApplicableChecks > 0 && (
                <p>{summary.notApplicableChecks} not applicable</p>
              )}
              {summary.errorChecks > 0 && (
                <p>{pluralize(summary.errorChecks, 'execution error')}</p>
              )}
              {summary.errorFindings > 0 && (
                <p>{pluralize(summary.errorFindings, 'critical finding')}</p>
              )}
              {summary.warningFindings > 0 && (
                <p>{pluralize(summary.warningFindings, 'warning finding')}</p>
              )}
              {summary.noticeFindings > 0 && (
                <p>{pluralize(summary.noticeFindings, 'notice finding')}</p>
              )}
            </>
          )}
          {summary.lastRunAt && (
            <p className='text-foreground pt-2 pb-1 font-medium'>
              {`${timeLabel} ${formatDateShort(summary.lastRunAt)}`}
            </p>
          )}
        </div>
        <button
          type='button'
          className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
          aria-label={`Run Quality for ${dataMartTitle}`}
          title={isActive ? 'A Data Quality run is already active' : undefined}
          disabled={isActive || isStartingQuality}
          onPointerDown={event => {
            event.stopPropagation();
          }}
          onClick={event => {
            void handleRunQualityClick(event);
          }}
        >
          {isStartingQuality ? (
            <LoaderCircle className='size-3.5 animate-spin' aria-hidden='true' />
          ) : (
            <Play className='size-3.5' aria-hidden='true' />
          )}
          {isStartingQuality ? 'Starting…' : 'Run Quality checks'}
        </button>
      </HoverCardContent>
    </HoverCard>
  );
}
