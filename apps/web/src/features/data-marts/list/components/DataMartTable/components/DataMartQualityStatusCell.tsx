import { Badge } from '@owox/ui/components/badge';
import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../../shared/hooks';
import type { DataQualityCompactSummary, DataQualitySummaryState } from '../../../../shared/types';

interface DataMartQualityStatusCellProps {
  dataMartId: string;
  summary: DataQualityCompactSummary | null | undefined;
}

const QUALITY_STATE_LABELS: Record<DataQualitySummaryState, string> = {
  NEVER_RUN: 'Never run',
  QUEUED: 'Queued',
  RUNNING: 'Running',
  PASSED: 'Passed',
  ISSUES: 'Issues',
  EXECUTION_FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  ALL_DISABLED: 'Disabled',
};

export function DataMartQualityStatusCell({ dataMartId, summary }: DataMartQualityStatusCellProps) {
  const { scope } = useProjectRoute();
  const state = summary?.state ?? 'NEVER_RUN';
  const label = QUALITY_STATE_LABELS[state];

  return (
    <Link
      to={scope(`/data-marts/${dataMartId}/quality`)}
      className='inline-flex'
      aria-label={`Open Quality: ${label}`}
      onClick={event => {
        event.stopPropagation();
      }}
    >
      <Badge
        variant={state === 'ISSUES' || state === 'EXECUTION_FAILED' ? 'destructive' : 'outline'}
      >
        {label}
      </Badge>
    </Link>
  );
}
