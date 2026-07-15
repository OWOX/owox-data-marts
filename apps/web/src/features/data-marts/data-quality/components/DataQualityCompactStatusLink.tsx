import { Badge } from '@owox/ui/components/badge';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDataQualityStatusPresentation } from '../model/data-quality.model';
import type { DataQualityCompactSummary } from '../model/types';

interface DataQualityCompactStatusLinkProps {
  projectId: string;
  dataMartId: string;
  summary?: DataQualityCompactSummary | null;
}

export function DataQualityCompactStatusLink({
  projectId,
  dataMartId,
  summary,
}: DataQualityCompactStatusLinkProps) {
  const presentation = summary
    ? getDataQualityStatusPresentation(summary)
    : getDataQualityStatusPresentation({ state: 'NEVER_RUN' });

  return (
    <div className='mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'>
      <div className='flex items-center gap-2'>
        <span className='text-sm font-medium'>Data Quality</span>
        <Badge variant='outline'>{presentation.title}</Badge>
      </div>
      <Link
        to={`/ui/${projectId}/data-marts/${dataMartId}/quality`}
        aria-label={`Open Quality: ${presentation.title}`}
        className='text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline'
      >
        Open Quality
        <ArrowRight className='size-4' aria-hidden='true' />
      </Link>
    </div>
  );
}
