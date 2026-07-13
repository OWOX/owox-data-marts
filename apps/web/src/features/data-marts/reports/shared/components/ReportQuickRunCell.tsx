import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import type { DataMartReport } from '../model/types/data-mart-report';
import { ReportStatusEnum } from '../enums';
import { useReport } from '../model';
import { RunUndoToast } from './RunUndoToast';

const GRACE_PERIOD_MS = 3000;

interface ReportQuickRunCellProps {
  report: DataMartReport;
  onRunSuccess?: () => void | Promise<void>;
}

export function ReportQuickRunCell({ report, onRunSuccess }: ReportQuickRunCellProps) {
  const canRun = report.canRun;
  const [isRunning, setIsRunning] = useState(report.lastRunStatus === ReportStatusEnum.RUNNING);
  const [isPending, setIsPending] = useState(false);
  const [isOptimisticRunning, setIsOptimisticRunning] = useState(false);
  const { runReport } = useReport();

  useEffect(() => {
    const running = report.lastRunStatus === ReportStatusEnum.RUNNING;
    setIsRunning(running);
    if (running) {
      setIsOptimisticRunning(false);
    }
  }, [report.lastRunStatus]);

  const mountedRef = useRef(true);
  const hasRunRef = useRef(false);
  const toastIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    };
  }, []);

  const executeRun = useCallback(async () => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }

    setIsPending(false);
    setIsOptimisticRunning(true);

    try {
      await runReport(report.id);
      if (onRunSuccess) await onRunSuccess();
    } catch (error) {
      console.error('Failed to run report:', error);
    } finally {
      if (mountedRef.current) {
        setIsOptimisticRunning(false);
      }
    }
  }, [runReport, report.id, onRunSuccess]);

  const handleRun = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canRun || isPending || isRunning || isOptimisticRunning) return;

      hasRunRef.current = false;
      setIsPending(true);

      const id = toast.custom(
        t => (
          <RunUndoToast
            toastId={t.id}
            reportName={report.title}
            gracePeriodMs={GRACE_PERIOD_MS}
            onConfirm={executeRun}
            onCancel={() => {
              if (hasRunRef.current) return;
              if (mountedRef.current) {
                setIsPending(false);
              }
            }}
          />
        ),
        { duration: Infinity, position: 'bottom-center' }
      );

      toastIdRef.current = id;
    },
    [canRun, isPending, isRunning, isOptimisticRunning, executeRun, report.title]
  );

  const isActive = isPending || isRunning || isOptimisticRunning;
  const tooltipText = isPending
    ? 'Starting soon…'
    : isRunning || isOptimisticRunning
      ? 'Report is running…'
      : 'Run report';

  return (
    <TooltipProvider>
      <div className='flex h-full w-full items-center justify-center'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleRun}
              variant='ghost'
              className='dm-card-table-body-row-actionbtn cursor-pointer transition-all disabled:opacity-30'
              disabled={!canRun || isActive}
              aria-label={isActive ? tooltipText : `Run report: ${report.title}`}
            >
              {isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
              ) : (
                <Play className='text-muted-foreground h-4 w-4' aria-hidden='true' />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side='bottom' role='tooltip'>
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
