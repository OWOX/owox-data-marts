import { useState, useEffect, useCallback } from 'react';
import { Play } from 'lucide-react';
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

interface ReportQuickRunCellProps {
  report: DataMartReport;
  onRunSuccess?: () => void | Promise<void>;
}

export function ReportQuickRunCell({ report, onRunSuccess }: ReportQuickRunCellProps) {
  const canRun = report.canRun;
  const [isRunning, setIsRunning] = useState(report.lastRunStatus === ReportStatusEnum.RUNNING);
  const { runReport } = useReport();

  useEffect(() => {
    setIsRunning(report.lastRunStatus === ReportStatusEnum.RUNNING);
  }, [report.lastRunStatus]);

  const handleRun = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canRun || isRunning) return;

      try {
        setIsRunning(true);
        await runReport(report.id);
        if (onRunSuccess) {
          await onRunSuccess();
        }
      } catch (error) {
        setIsRunning(false);
        console.error('Failed to run report:', error);
      }
    },
    [canRun, isRunning, runReport, report.id, onRunSuccess]
  );

  const tooltipText = isRunning ? 'Report is running...' : 'Run report';

  return (
    <TooltipProvider>
      <div className='flex h-full w-full items-center justify-center'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleRun}
              variant='ghost'
              className='text-muted-foreground hover:text-primary h-8 w-8 p-0 opacity-60 transition-all duration-200 hover:opacity-100 disabled:opacity-30'
              disabled={!canRun || isRunning}
              aria-label={isRunning ? 'Report is running...' : `Run report: ${report.title}`}
            >
              <Play className='h-4 w-4' aria-hidden='true' />
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
