import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { DataQualityResultCard } from '../../../data-quality/components/DataQualityResultCard';
import { DataQualitySummaryPanel } from '../../../data-quality/components/DataQualitySummaryPanel';
import { useDataQualityRun } from '../../../data-quality/model/use-data-quality-workspace';

interface DataQualityRunHistoryDetailsProps {
  projectId: string;
  dataMartId: string;
  runId: string;
}

export function DataQualityRunHistoryDetails({
  projectId,
  dataMartId,
  runId,
}: DataQualityRunHistoryDetailsProps) {
  const { data, isLoading, isError, error } = useDataQualityRun(projectId, dataMartId, runId);

  if (isLoading) return <SkeletonList />;
  if (isError || !data) {
    return (
      <div role='alert' className='text-destructive rounded-md border p-4 text-sm'>
        {error instanceof Error ? error.message : 'Failed to load Data Quality run details'}
      </div>
    );
  }

  return (
    <div className='space-y-4' data-testid='data-quality-run-details'>
      <DataQualitySummaryPanel summary={data.summary} checkedAt={data.finishedAt} />

      {data.snapshot && (
        <details className='rounded-md border p-3' open>
          <summary className='cursor-pointer text-sm font-medium'>Run snapshot</summary>
          <pre className='bg-muted mt-3 overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
            {safeJson(data.snapshot)}
          </pre>
        </details>
      )}

      <div className='space-y-3'>
        {data.results.length === 0 ? (
          <p className='text-muted-foreground rounded-md border p-4 text-sm'>
            No check results were saved for this run.
          </p>
        ) : (
          data.results.map(result => (
            <div key={result.id} className='space-y-2'>
              <DataQualityResultCard result={result} />
              {result.reproductionSql && (
                <details className='rounded-md border p-3' open>
                  <summary className='cursor-pointer text-sm font-medium'>Reproduction SQL</summary>
                  <pre className='bg-muted mt-3 overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
                    {result.reproductionSql}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[Unable to display snapshot]';
  }
}
