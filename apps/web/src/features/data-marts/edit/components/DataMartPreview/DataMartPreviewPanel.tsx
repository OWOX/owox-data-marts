import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RotateCw, TriangleAlert, X } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import type { FilterRule } from '../../../shared/types/output-config';
import { operatorLabelFor } from '../ReportColumnPicker/output-controls-operators';
import { summarizeFilterRule } from '../ReportColumnPicker/filter-rule-summary';
import { PreviewResultsTable } from './PreviewResultsTable';
import {
  PREVIEW_DEFAULT_LIMIT,
  PREVIEW_MAX_LIMIT,
  type PreviewRequest,
  useDataMartPreview,
} from './useDataMartPreview';

interface DataMartPreviewPanelProps {
  dataMartId: string;
  /** Changes identity whenever the saved schema changes — marks an older preview as outdated. */
  savedSchemaVersion: unknown;
  /** Why the preview cannot run right now; the button is disabled with this as its hint. */
  disabledReason?: string | null;
  /** Wraps a run so unsaved schema edits are saved or discarded first. */
  runGuarded: (action: () => void | Promise<void>) => void;
}

function parseLimit(value: string): number | null {
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= PREVIEW_MAX_LIMIT ? limit : null;
}

/**
 * Data Setup preview: reads a sample of the Data Mart's rows from the warehouse. Every run —
 * the first one, Re-run, a new limit or a filter change — is a new warehouse query, recorded in
 * Run History and charged as a report run. Paging through the returned rows is local and free.
 */
export function DataMartPreviewPanel({
  dataMartId,
  savedSchemaVersion,
  disabledReason,
  runGuarded,
}: DataMartPreviewPanelProps) {
  const { result, appliedRequest, isLoading, error, run, cancel } = useDataMartPreview(dataMartId);
  const [limitInput, setLimitInput] = useState(String(PREVIEW_DEFAULT_LIMIT));

  // Remember which saved schema the shown rows came from.
  const schemaAtRunRef = useRef<unknown>(null);
  const [isOutdated, setIsOutdated] = useState(false);
  useEffect(() => {
    if (result && schemaAtRunRef.current !== savedSchemaVersion) setIsOutdated(true);
  }, [savedSchemaVersion, result]);

  const appliedLimit = appliedRequest?.limit ?? PREVIEW_DEFAULT_LIMIT;
  const appliedFilters = useMemo(() => appliedRequest?.filters ?? [], [appliedRequest]);
  const parsedLimit = parseLimit(limitInput);
  // The limit the Update button would apply; null while the field is unchanged or invalid.
  const pendingLimit = parsedLimit !== null && parsedLimit !== appliedLimit ? parsedLimit : null;

  const start = useCallback(
    (request: PreviewRequest) => {
      runGuarded(async () => {
        schemaAtRunRef.current = savedSchemaVersion;
        setIsOutdated(false);
        await run(request);
      });
    },
    [runGuarded, run, savedSchemaVersion]
  );

  const handleFilterChange = useCallback(
    (column: string, rule: FilterRule | null) => {
      const others = appliedFilters.filter(existing => existing.column !== column);
      start({ limit: appliedLimit, filters: rule ? [...others, rule] : others });
    },
    [appliedFilters, appliedLimit, start]
  );

  const isDisabled = Boolean(disabledReason);

  if (!result && !error) {
    return (
      <div className='rounded-lg border border-dashed px-6 py-8 text-center'>
        <p className='text-foreground text-sm font-medium'>
          Preview real data from your Input Source.
        </p>
        <p className='text-muted-foreground mx-auto mt-1 max-w-md text-xs'>
          Running a preview executes the query in your data warehouse and may consume credits.
          Showing the first {PREVIEW_DEFAULT_LIMIT} rows by default.
        </p>
        <div className='mt-4 flex items-center justify-center gap-2'>
          <Button
            onClick={() => {
              start({ limit: PREVIEW_DEFAULT_LIMIT, filters: [] });
            }}
            disabled={isDisabled || isLoading}
            title={disabledReason ?? undefined}
          >
            {isLoading && <Loader2 className='size-4 animate-spin' />}
            {isLoading ? 'Running preview…' : 'Preview data'}
          </Button>
          {isLoading && (
            <Button variant='ghost' onClick={cancel}>
              Cancel
            </Button>
          )}
        </div>
        {disabledReason && <p className='text-muted-foreground mt-2 text-xs'>{disabledReason}</p>}
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span
            className={
              error ? 'bg-destructive size-2.5 rounded-full' : 'size-2.5 rounded-full bg-green-600'
            }
            aria-hidden
          />
          <span className='text-sm font-medium'>Preview Results</span>
          {result && (
            <span className='text-muted-foreground text-sm'>
              ({result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'})
            </span>
          )}
          {appliedFilters.length > 0 && (
            <button
              type='button'
              disabled={isLoading}
              onClick={() => {
                start({ limit: appliedLimit, filters: [] });
              }}
              className='bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50'
              aria-label='Clear all filters'
            >
              {appliedFilters.length} {appliedFilters.length === 1 ? 'filter' : 'filters'}
              <X className='size-3' />
            </button>
          )}
        </div>
        <div className='flex items-center gap-2'>
          {isLoading && (
            <Button variant='ghost' size='sm' onClick={cancel}>
              Cancel
            </Button>
          )}
          <Button
            variant='outline'
            size='sm'
            disabled={isDisabled || isLoading}
            title={disabledReason ?? undefined}
            onClick={() => {
              start({ limit: appliedLimit, filters: appliedFilters });
            }}
          >
            {isLoading ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <RotateCw className='size-4' />
            )}
            Re-run
          </Button>
        </div>
      </div>

      {appliedFilters.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {appliedFilters.map(rule => {
            const type = result?.columns.find(c => c.name === rule.column)?.type ?? '';
            const value = summarizeFilterRule(rule);
            return (
              <span
                key={rule.column}
                className='bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs'
              >
                {rule.column} {operatorLabelFor(rule.operator, type)}
                {value && ` ${value.replace(/^"(.*)"$/, '$1')}`}
                <button
                  type='button'
                  disabled={isLoading}
                  onClick={() => {
                    handleFilterChange(rule.column, null);
                  }}
                  className='text-muted-foreground hover:text-foreground disabled:opacity-50'
                  aria-label={`Remove filter on ${rule.column}`}
                >
                  <X className='size-3' />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {isOutdated && !isLoading && (
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <TriangleAlert className='size-3.5' />
          The schema changed since this preview. Re-run to see current data.
        </div>
      )}

      {error && (
        <div
          role='alert'
          className='border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm'
        >
          {error}
        </div>
      )}

      {result && (
        <div className={isLoading ? 'pointer-events-none opacity-60 transition-opacity' : ''}>
          <PreviewResultsTable
            columns={result.columns}
            rows={result.rows}
            filters={appliedFilters}
            onFilterChange={handleFilterChange}
            filtersDisabled={isLoading || isDisabled}
          />
        </div>
      )}

      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <label htmlFor='data-mart-preview-limit' className='text-muted-foreground'>
          Limit
        </label>
        <Input
          id='data-mart-preview-limit'
          type='number'
          min={1}
          max={PREVIEW_MAX_LIMIT}
          value={limitInput}
          onChange={e => {
            setLimitInput(e.target.value);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && pendingLimit !== null) {
              start({ limit: pendingLimit, filters: appliedFilters });
            }
          }}
          className='h-8 w-24'
        />
        {pendingLimit !== null && (
          <Button
            size='sm'
            disabled={isLoading || isDisabled}
            onClick={() => {
              start({ limit: pendingLimit, filters: appliedFilters });
            }}
          >
            Update
          </Button>
        )}
        <span className='text-muted-foreground'>
          {parsedLimit === null
            ? `Enter a number from 1 to ${String(PREVIEW_MAX_LIMIT)}`
            : 'rows fetched from warehouse'}
        </span>
        {result?.truncated && pendingLimit === null && (
          <span className='text-muted-foreground text-xs'>
            · More rows match — raise the limit to see them.
          </span>
        )}
      </div>
    </div>
  );
}
