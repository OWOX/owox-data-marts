import { Badge } from '@owox/ui/components/badge';
import { Card, CardContent, CardHeader } from '@owox/ui/components/card';
import { cn } from '@owox/ui/lib/utils';
import type { ReactNode } from 'react';
import { formatDateShort } from '../../../../utils/date-formatters';
import { getDataQualityStatusPresentation } from '../model/data-quality.model';
import {
  DATA_QUALITY_STATUS_TEXT_CLASSES,
  getDataQualityStatusVisual,
} from '../../shared/utils/data-quality-status';
import type { DataQualityStatusTone } from '../../shared/utils/data-quality-status';
import type { DataQualitySummary } from '../model/types';

interface DataQualitySummaryPanelProps {
  summary: DataQualitySummary;
  checkedAt?: string | null;
  actions?: ReactNode;
}

const TONE_CLASSES: Record<DataQualityStatusTone, string> = {
  neutral: 'border-border',
  progress: 'border-brand-blue-300 bg-brand-blue-50/40 dark:bg-brand-blue-950/10',
  success: 'border-success/40 bg-success-bg',
  warning: 'border-warning/40 bg-warning-bg',
  error: 'border-destructive/40 bg-destructive-bg',
  notice: 'border-notice/30 bg-notice-bg',
};

type SummaryChipTone = 'neutral' | 'success' | 'error' | 'warning' | 'notice';

const SUMMARY_CHIP_TONE_CLASSES: Record<SummaryChipTone, string | undefined> = {
  neutral: undefined,
  success: 'border-success/40 bg-success/10 text-success',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  notice: 'border-notice/40 bg-notice/10 text-notice',
};

export function DataQualitySummaryPanel({
  summary,
  checkedAt,
  actions,
}: DataQualitySummaryPanelProps) {
  const presentation = getDataQualityStatusPresentation(summary);
  const visual = getDataQualityStatusVisual(summary);
  const Icon = visual.icon;

  return (
    <Card
      className={cn('gap-4 py-4', TONE_CLASSES[visual.tone])}
      aria-live={visual.isActive ? 'polite' : undefined}
    >
      <CardHeader className='grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-5'>
        <Icon
          className={cn(
            'mt-0.5 size-5',
            DATA_QUALITY_STATUS_TEXT_CLASSES[visual.tone],
            visual.isActive && 'animate-spin'
          )}
          aria-hidden='true'
        />
        <div className='min-w-0'>
          <h2 className='font-semibold'>{presentation.title}</h2>
          <p className='text-muted-foreground mt-1 text-sm'>{presentation.description}</p>
          {checkedAt && (
            <p className='text-muted-foreground mt-2 text-xs'>
              Last checked {formatDateShort(checkedAt)}
            </p>
          )}
        </div>
        {actions && <div className='flex shrink-0 items-center gap-2'>{actions}</div>}
      </CardHeader>
      <CardContent className='px-5'>
        <DataQualitySummaryChips summary={summary} />
      </CardContent>
    </Card>
  );
}

export function DataQualitySummaryChips({ summary }: { summary: DataQualitySummary }) {
  const chips = [
    counter(summary.enabledChecks, 'enabled'),
    counter(summary.passedChecks, 'passed', 'success'),
    counter(summary.notApplicableChecks, 'not applicable'),
    counter(
      summary.errorChecks,
      summary.errorChecks === 1 ? 'execution error' : 'execution errors',
      'error'
    ),
    counter(summary.errorFindings, 'error', 'error'),
    counter(summary.warningFindings, 'warning', 'warning'),
    counter(summary.noticeFindings, 'notice', 'notice'),
  ].filter((chip): chip is NonNullable<typeof chip> => chip !== null);

  if (summary.state === 'PASSED' && summary.failedChecks === 0 && summary.errorChecks === 0) {
    chips.push({ label: 'No findings', tone: 'neutral' });
  }

  if (chips.length === 0) return null;

  return (
    <div className='flex flex-wrap gap-2'>
      {chips.map(chip => (
        <Badge key={chip.label} variant='outline' className={SUMMARY_CHIP_TONE_CLASSES[chip.tone]}>
          {chip.label}
        </Badge>
      ))}
    </div>
  );
}

function counter(count: number, label: string, tone: SummaryChipTone = 'neutral') {
  return count > 0 ? { label: `${count} ${label}`, tone } : null;
}
