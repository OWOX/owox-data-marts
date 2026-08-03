import { LoaderCircle, Play, ShieldAlert, ShieldX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@owox/ui/components/popover';
import { useEffect, useRef, useState } from 'react';
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

const PREVIEW_OPEN_DELAY_MS = 100;
const PREVIEW_CLOSE_DELAY_MS = 200;

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function DataQualityCanvasStatusIcon({
  dataMartTitle,
  summary,
  onOpenQuality,
  onRunQuality,
}: DataQualityCanvasStatusIconProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isStartingQuality, setIsStartingQuality] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openActionRef = useRef<HTMLButtonElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinnedRef = useRef(false);
  const restoreFocusOnCloseRef = useRef(false);
  const suppressFocusOpenRef = useRef(false);
  const presentation = getDataQualityStatusVisual(summary);
  const StatusIcon = presentation.icon;
  const resultIndicators = [
    {
      count: summary.errorChecks,
      singular: 'execution error',
      tone: 'error' as const,
      icon: ShieldX,
    },
    {
      count: summary.errorFindings,
      singular: 'critical finding',
      tone: 'error' as const,
      icon: ShieldAlert,
    },
    {
      count: summary.warningFindings,
      singular: 'warning finding',
      tone: 'warning' as const,
      icon: ShieldAlert,
    },
    {
      count: summary.noticeFindings,
      singular: 'notice finding',
      tone: 'notice' as const,
      icon: ShieldAlert,
    },
  ].filter(indicator => indicator.count > 0);
  const showResultIndicators =
    (summary.state === 'ISSUES' || summary.state === 'EXECUTION_FAILED') &&
    resultIndicators.length > 0;
  const resultIndicatorLabel = resultIndicators
    .map(indicator => pluralize(indicator.count, indicator.singular))
    .join(', ');
  const actionLabel = `Open Data Quality for ${dataMartTitle}: ${presentation.label}${showResultIndicators ? `, ${resultIndicatorLabel}` : ''}`;
  const isActive = presentation.isActive;
  const timeLabel =
    summary.state === 'QUEUED'
      ? 'Queued'
      : summary.state === 'RUNNING'
        ? 'Started'
        : 'Last checked';

  function clearOpenTimer() {
    if (openTimerRef.current === null) return;
    clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }

  function clearCloseTimer() {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function clearPreviewTimers() {
    clearOpenTimer();
    clearCloseTimer();
  }

  function schedulePreviewOpen() {
    clearCloseTimer();
    if (isOpen || isPinnedRef.current || openTimerRef.current !== null) return;

    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      if (isPinnedRef.current) return;
      setIsOpen(true);
    }, PREVIEW_OPEN_DELAY_MS);
  }

  function schedulePreviewClose() {
    clearOpenTimer();
    if (!isOpen || isPinnedRef.current || closeTimerRef.current !== null) return;

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (isPinnedRef.current) return;
      setIsOpen(false);
    }, PREVIEW_CLOSE_DELAY_MS);
  }

  function handleTriggerClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    clearPreviewTimers();

    if (isPinnedRef.current && isOpen) {
      isPinnedRef.current = false;
      setIsOpen(false);
      return;
    }

    isPinnedRef.current = true;
    setIsOpen(true);

    if (event.detail === 0) {
      queueMicrotask(() => {
        openActionRef.current?.focus();
      });
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    clearPreviewTimers();
    if (nextOpen) {
      isPinnedRef.current = true;
      setIsOpen(true);
      return;
    }

    isPinnedRef.current = false;
    setIsOpen(false);
  }

  function handleOpenQualityClick(event: MouseEvent<HTMLButtonElement>) {
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

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;

      if (openTimerRef.current !== null) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      isPinnedRef.current = false;
      setIsOpen(false);
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, [isOpen]);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type='button'
          className={`${showResultIndicators ? '' : DATA_QUALITY_STATUS_TEXT_CLASSES[presentation.tone]} -ml-0.5 inline-flex shrink-0 cursor-pointer items-center rounded p-0.5 transition-colors ${showResultIndicators ? 'gap-1.5' : ''}`}
          aria-label={actionLabel}
          onPointerDown={event => {
            event.stopPropagation();
          }}
          onPointerEnter={() => {
            schedulePreviewOpen();
          }}
          onPointerLeave={() => {
            schedulePreviewClose();
          }}
          onFocus={() => {
            if (suppressFocusOpenRef.current) {
              suppressFocusOpenRef.current = false;
              return;
            }
            schedulePreviewOpen();
          }}
          onBlur={() => {
            schedulePreviewClose();
          }}
          onClick={handleTriggerClick}
        >
          {showResultIndicators ? (
            resultIndicators.map(indicator => {
              const label = pluralize(indicator.count, indicator.singular);
              const IndicatorIcon = indicator.icon;
              return (
                <span
                  key={indicator.singular}
                  role='img'
                  aria-label={label}
                  className={`${DATA_QUALITY_STATUS_TEXT_CLASSES[indicator.tone]} inline-flex items-center gap-0.5`}
                >
                  <IndicatorIcon className='size-4' aria-hidden={true} />
                  <span className='leading-none font-medium tabular-nums'>{indicator.count}</span>
                </span>
              );
            })
          ) : (
            <StatusIcon
              className={`size-4 ${summary.state === 'RUNNING' ? 'animate-spin' : ''}`}
              aria-hidden={true}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        side='top'
        align='center'
        role='region'
        aria-label={`Data Quality checks for ${dataMartTitle}`}
        className='w-72 max-w-72 p-3 text-xs sm:w-72 sm:max-w-72'
        onOpenAutoFocus={event => {
          event.preventDefault();
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!restoreFocusOnCloseRef.current) return;

          restoreFocusOnCloseRef.current = false;
          suppressFocusOpenRef.current = true;
          triggerRef.current?.focus({ preventScroll: true });
          queueMicrotask(() => {
            suppressFocusOpenRef.current = false;
          });
        }}
        onEscapeKeyDown={() => {
          restoreFocusOnCloseRef.current = true;
        }}
        onPointerEnter={() => {
          clearCloseTimer();
        }}
        onPointerLeave={() => {
          schedulePreviewClose();
        }}
        onPointerDown={event => {
          event.stopPropagation();
        }}
      >
        <div className='border-border flex items-center justify-between gap-3 border-b pb-2'>
          <PopoverTitle className='text-sm font-semibold whitespace-nowrap'>
            Data Quality checks
          </PopoverTitle>
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
        <div className='grid grid-cols-2 gap-2'>
          <button
            ref={openActionRef}
            type='button'
            className='border-input bg-background hover:bg-muted inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 font-medium transition-colors'
            aria-label={`Open Data Quality page for ${dataMartTitle}`}
            onPointerDown={event => {
              event.stopPropagation();
            }}
            onClick={handleOpenQualityClick}
          >
            Open
          </button>
          <button
            type='button'
            className='bg-primary text-primary-foreground hover:bg-primary/90 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
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
            {isStartingQuality ? 'Starting…' : 'Run checks'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
