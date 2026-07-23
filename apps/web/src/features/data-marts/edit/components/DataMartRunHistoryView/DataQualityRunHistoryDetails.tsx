import { Badge } from '@owox/ui/components/badge';
import { Card, CardContent, CardHeader } from '@owox/ui/components/card';
import { SkeletonList } from '@owox/ui/components/common/skeleton-list';
import { cn } from '@owox/ui/lib/utils';
import { ChevronDown, Clock3, FileJson2, Play, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../../../shared/components/Button';
import { formatDateShort, formatDuration } from '../../../../../utils/date-formatters';
import { DataQualityResultCard } from '../../../data-quality/components/DataQualityResultCard';
import { DataQualitySummaryChips } from '../../../data-quality/components/DataQualitySummaryPanel';
import {
  DATA_QUALITY_CATEGORY_LABELS,
  dataQualityScopeLabel,
  getDataQualityRelationshipPresentation,
  getDataQualityStatusPresentation,
  sortDataQualityResults,
} from '../../../data-quality/model/data-quality.model';
import { useDataQualityRun } from '../../../data-quality/model/use-data-quality-workspace';
import {
  DATA_QUALITY_STATUS_TEXT_CLASSES,
  getDataQualityStatusVisual,
} from '../../../shared/utils/data-quality-status';
import type { DataQualityRun, DataQualityRunSnapshot } from '../../../data-quality/model/types';

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
  const { data, isLoading, isError, refetch } = useDataQualityRun(projectId, dataMartId, runId);

  if (isLoading) return <SkeletonList />;
  if (isError || !data) {
    return (
      <div role='alert' className='border-destructive/40 bg-destructive/5 rounded-md border p-4'>
        <p className='text-sm font-medium'>
          Couldn&apos;t load the details of this run. The rest of the history is unaffected.
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='mt-3'
          onClick={() => {
            void refetch();
          }}
        >
          <RotateCw className='size-4' aria-hidden='true' />
          Retry
        </Button>
      </div>
    );
  }

  const sortedResults = sortDataQualityResults(data.results);
  const isActive = data.summary.state === 'QUEUED' || data.summary.state === 'RUNNING';
  const isPartial = data.summary.state === 'EXECUTION_FAILED' || data.summary.state === 'CANCELLED';

  return (
    <div className='space-y-4' data-testid='data-quality-run-details'>
      <RunOverview run={data} />

      {(isActive || isPartial) && (
        <div className='bg-muted/50 flex items-start gap-2 rounded-md border p-3 text-sm'>
          {isActive ? (
            <Play className='text-primary mt-0.5 size-4 shrink-0' aria-hidden='true' />
          ) : (
            <Clock3 className='text-muted-foreground mt-0.5 size-4 shrink-0' aria-hidden='true' />
          )}
          <p>
            {isActive
              ? 'This run is still in progress. Saved results update automatically.'
              : 'This run ended early. Results completed before it stopped are preserved.'}
          </p>
        </div>
      )}

      <RunSummary run={data} />

      <section className='space-y-3' aria-labelledby={`quality-results-${runId}`}>
        <h4 id={`quality-results-${runId}`} className='font-semibold'>
          Check results
        </h4>
        {sortedResults.length === 0 ? (
          <p className='text-muted-foreground rounded-md border p-4 text-sm'>
            No check results were saved for this run.
          </p>
        ) : (
          sortedResults.map(result => {
            const relationshipPresentation =
              result.scope.type === 'RELATIONSHIP'
                ? getDataQualityRelationshipPresentation(
                    result.scope.relationshipId,
                    data.snapshot?.relationships ?? []
                  )
                : undefined;

            return (
              <DataQualityResultCard
                key={result.id}
                result={result}
                titleSuffix={relationshipPresentation?.titleSuffix}
                scopeLabel={relationshipPresentation?.scopeLabel}
                scopeDetails={relationshipPresentation?.scopeDetails}
                targetAlias={relationshipPresentation?.targetAlias}
              />
            );
          })
        )}
      </section>

      {data.snapshot && <RunSnapshot snapshot={data.snapshot} />}

      <div className='flex justify-end border-t pt-4'>
        <Link
          to={`/ui/${projectId}/data-marts/${dataMartId}/quality`}
          className='text-muted-foreground hover:text-foreground text-sm font-medium hover:underline'
        >
          Open Data Quality
        </Link>
      </div>
    </div>
  );
}

function RunOverview({ run }: { run: DataQualityRun }) {
  const duration =
    run.startedAt && run.finishedAt
      ? formatDuration(new Date(run.startedAt), new Date(run.finishedAt))
      : '—';

  return (
    <section aria-labelledby={`quality-overview-${run.id}`}>
      <h4 id={`quality-overview-${run.id}`} className='mb-3 font-semibold'>
        Run overview
      </h4>
      <div className='grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3'>
        <OverviewItem label='Started' value={formatDateShort(run.startedAt ?? run.createdAt)} />
        <OverviewItem label='Finished' value={formatDateShort(run.finishedAt)} />
        <OverviewItem label='Duration' value={duration} />
        <OverviewItem label='Configuration' value={run.snapshot?.definitionType ?? '—'} />
        <OverviewItem label='Timezone' value={run.snapshot?.timezone ?? '—'} />
      </div>
    </section>
  );
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-background rounded-md border p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='mt-1 truncate text-sm font-medium' title={value}>
        {value}
      </p>
    </div>
  );
}

function RunSummary({ run }: { run: DataQualityRun }) {
  const presentation = getDataQualityStatusPresentation(run.summary);
  const visual = getDataQualityStatusVisual(run.summary);
  const Icon = visual.icon;

  return (
    <Card className='gap-3 py-4 shadow-none'>
      <CardHeader className='flex flex-row items-center gap-2 px-4'>
        <Icon
          className={cn(
            'size-5',
            DATA_QUALITY_STATUS_TEXT_CLASSES[visual.tone],
            visual.isActive && 'animate-spin'
          )}
          aria-hidden='true'
        />
        <div>
          <p className='font-medium'>{presentation.title}</p>
          <p className='text-muted-foreground text-xs'>{presentation.description}</p>
        </div>
      </CardHeader>
      <CardContent className='px-4'>
        <DataQualitySummaryChips summary={run.summary} />
      </CardContent>
    </Card>
  );
}

function RunSnapshot({ snapshot }: { snapshot: DataQualityRunSnapshot }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRawOpen, setIsRawOpen] = useState(false);
  const displayedSnapshot = getDisplayedSnapshot(snapshot);
  const enabledRules = displayedSnapshot.config.rules;

  return (
    <section className='overflow-hidden rounded-md border'>
      <button
        type='button'
        aria-label='Run snapshot'
        aria-expanded={isOpen}
        className='hover:bg-muted/40 focus-visible:ring-ring flex w-full items-center gap-2 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset'
        onClick={() => {
          setIsOpen(value => !value);
        }}
      >
        <FileJson2 className='text-muted-foreground size-4' aria-hidden='true' />
        <span className='flex-1 text-sm font-medium'>Run snapshot</span>
        <span className='text-muted-foreground text-xs'>{enabledRules.length} enabled</span>
        <ChevronDown
          className={cn(
            'text-muted-foreground size-4 transition-transform',
            isOpen && 'rotate-180'
          )}
          aria-hidden='true'
        />
      </button>

      {isOpen && (
        <div className='space-y-4 border-t p-4'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <SnapshotValue label='Timezone' value={snapshot.timezone} />
            <SnapshotValue label='Definition type' value={snapshot.definitionType} />
          </div>

          <div>
            <p className='mb-2 text-sm font-medium'>Configured checks</p>
            <div className='divide-y rounded-md border'>
              {enabledRules.map(rule => (
                <div key={rule.key} className='flex flex-wrap items-center gap-2 px-3 py-2 text-sm'>
                  <span className='font-medium'>{DATA_QUALITY_CATEGORY_LABELS[rule.category]}</span>
                  <code className='text-muted-foreground text-xs'>
                    {dataQualityScopeLabel(rule.scope)}
                  </code>
                  <Badge variant='outline' className='ml-auto'>
                    {rule.severity}
                  </Badge>
                  <Badge variant='secondary'>Enabled</Badge>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              aria-expanded={isRawOpen}
              onClick={() => {
                setIsRawOpen(value => !value);
              }}
            >
              <ChevronDown
                className={cn('size-4 transition-transform', isRawOpen && 'rotate-180')}
                aria-hidden='true'
              />
              View raw JSON
            </Button>
            {isRawOpen && (
              <pre className='bg-muted mt-2 max-h-80 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
                {safeJson(displayedSnapshot)}
              </pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function getDisplayedSnapshot(snapshot: DataQualityRunSnapshot): DataQualityRunSnapshot {
  const enabledRules = snapshot.config.rules.filter(rule => rule.enabled);
  const enabledRelationshipIds = new Set(
    enabledRules.flatMap(rule =>
      rule.scope.type === 'RELATIONSHIP' ? [rule.scope.relationshipId] : []
    )
  );

  return {
    ...snapshot,
    config: { ...snapshot.config, rules: enabledRules },
    relationships: snapshot.relationships.filter(relationship => {
      if (typeof relationship !== 'object' || relationship === null || !('id' in relationship)) {
        return false;
      }
      return typeof relationship.id === 'string' && enabledRelationshipIds.has(relationship.id);
    }),
  };
}

function SnapshotValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='mt-1 text-sm font-medium'>{value}</p>
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
