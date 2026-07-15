import { Badge } from '@owox/ui/components/badge';
import { Card, CardContent, CardHeader } from '@owox/ui/components/card';
import { cn } from '@owox/ui/lib/utils';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import { formatDateShort } from '../../../../utils/date-formatters';
import { getDataQualityStatusPresentation } from '../model/data-quality.model';
import type { DataQualityStatusPresentation, DataQualitySummary } from '../model/types';
import type { LucideIcon } from 'lucide-react';

interface DataQualitySummaryPanelProps {
  summary: DataQualitySummary;
  checkedAt?: string | null;
}

const TONE_CLASSES: Record<DataQualityStatusPresentation['tone'], string> = {
  neutral: 'border-border',
  progress: 'border-brand-blue-300 bg-brand-blue-50/40 dark:bg-brand-blue-950/10',
  success: 'border-green-300 bg-green-50/40 dark:bg-green-950/10',
  warning: 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/10',
  error: 'border-red-300 bg-red-50/40 dark:bg-red-950/10',
};

const STATUS_ICONS: Record<DataQualityStatusPresentation['tone'], LucideIcon> = {
  neutral: CircleDashed,
  progress: Loader2,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export function DataQualitySummaryPanel({ summary, checkedAt }: DataQualitySummaryPanelProps) {
  const presentation = getDataQualityStatusPresentation(summary);
  const Icon = STATUS_ICONS[presentation.tone];
  const isActive = summary.state === 'QUEUED' || summary.state === 'RUNNING';

  return (
    <Card className={cn('gap-4 py-5', TONE_CLASSES[presentation.tone])}>
      <CardHeader className='grid grid-cols-[auto_1fr] gap-x-3 px-5'>
        <Icon className={cn('mt-0.5 size-5', isActive && 'animate-spin')} aria-hidden='true' />
        <div className='min-w-0'>
          <h2 className='font-semibold'>{presentation.title}</h2>
          <p className='text-muted-foreground mt-1 text-sm'>{presentation.description}</p>
          {checkedAt && (
            <p className='text-muted-foreground mt-2 text-xs'>
              Last checked {formatDateShort(checkedAt)}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className='flex flex-wrap gap-2 px-5'>
        <Badge variant='outline'>{summary.enabledChecks} enabled</Badge>
        <Badge variant='outline'>{summary.passedChecks} passed</Badge>
        <Badge variant={summary.failedChecks > 0 ? 'destructive' : 'outline'}>
          {summary.failedChecks} failed
        </Badge>
        <Badge variant='outline'>{summary.notApplicableChecks} not applicable</Badge>
        {summary.errorChecks > 0 && (
          <Badge variant='destructive'>{summary.errorChecks} execution errors</Badge>
        )}
        <Badge variant='outline'>{summary.violationCount} violations</Badge>
      </CardContent>
    </Card>
  );
}
