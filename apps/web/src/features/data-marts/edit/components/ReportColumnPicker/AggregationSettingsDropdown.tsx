import { useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { FieldSearchPicker, type FieldPickerItem } from './FieldSearchPicker';
import type {
  AggregationRule,
  DateTruncRule,
  OutputConfig,
} from '../../../shared/types/output-config';
import type {
  AggregationRole,
  ReportAggregateFunction,
} from '../../../shared/types/relationship.types';
import { AggregationRow } from './AggregationRow';
import { DateTruncRow } from './DateTruncRow';
import { RowAggregationIcon } from './RowAggregationIcon';
import { resolveColumnAllowedAggregations } from '../../../shared/utils/aggregation-governance';
import { applyAggregationDraft, bucketForColumn, functionsForColumn } from './aggregation-config';
import { isDateType } from './output-controls-operators';
import { REPORT_AGGREGATE_FUNCTION_LABELS } from '../../../shared/utils/aggregation-labels';

function SectionHeader({ title, info }: { title: string; info: string }) {
  return (
    <div className='text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase'>
      <span>{title}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='text-muted-foreground/60 hover:text-muted-foreground inline-flex'>
            <Info className='size-3.5' aria-label={`About ${title}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side='top'
          collisionPadding={8}
          className='max-w-[min(20rem,calc(100vw-1.5rem))] text-xs whitespace-pre-wrap normal-case'
        >
          {info}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const SECTION_INFO = {
  aggregate:
    'Aggregate a column with one or more functions (SUM, AVG, COUNT…). Each function adds its ' +
    'own output column. Grouping is implied: every selected column without an aggregation ' +
    "becomes a grouping key. The available functions depend on the column's type and governance.",
} as const;

export interface AggregationDropdownColumn {
  name: string;
  type: string;
  /** Business-readable field name (alias or leaf of name). */
  label: string;
  /** Joined data mart name; absent for home-mart fields. */
  dataMartName?: string;
  /** Full path segments, shown as a tree on hover. */
  path?: string[];
  /** Aggregation governance (optional; absent → type-derived defaults). */
  aggregationRole?: AggregationRole;
  allowedAggregations?: ReportAggregateFunction[];
  /** DM-level post-join allowed aggregation set; present only on joined fields. */
  postJoinAggregations?: ReportAggregateFunction[];
  /**
   * True for a column that can never be a report's grouping key — so it is offered no date bucket,
   * and a stored bucket rule on it renders as an orphan. Two cases, both permanent rules rather
   * than missing features: an AGGREGATE-level calculated field, whose formula already aggregates
   * and is therefore not a dimension at all; and a JOINED Data Mart's calculated field, which this
   * report may not name on any surface, whichever level it is. A ROW-LEVEL formula of the report's
   * OWN Data Mart is a dimension and buckets like any other column of its declared type.
   * Gates the bucket alone; the aggregation menu comes from the allowed set as usual.
   */
  isAggregateLevelCalculated?: boolean;
  /**
   * True for ANY calculated field, at either level, which is offered no bucket TIME ZONE. Separate from the
   * flag above and not implied by it: a row-level formula buckets like the
   * column beside it and is still refused the zone. Snowflake's `CONVERT_TIMEZONE` is the one thing
   * that coerces a formula's string into a date, and it read `05/08/2026` as May where the formula
   * meant the 5th of August — no error, and a month decided by the warehouse session.
   */
  isCalculated?: boolean;
}

/** Resolved allowed aggregate functions for a column. */
function allowedAggregationsFor(
  column: AggregationDropdownColumn
): readonly ReportAggregateFunction[] {
  return resolveColumnAllowedAggregations(column);
}

function columnToPickerItem(c: AggregationDropdownColumn): FieldPickerItem {
  return {
    value: c.name,
    label: c.label,
    dataMartName: c.dataMartName,
    path: c.path,
  };
}

interface AggregationSettingsDropdownProps {
  value: OutputConfig;
  onChange: (next: OutputConfig) => void;
  selectedColumns: readonly AggregationDropdownColumn[];
  /**
   * What the product will aggregate because the analyst aggregated nothing, keyed by column. The
   * panel would otherwise read as empty on a report that does in fact group.
   */
  autoAggregations?: ReadonlyMap<string, ReportAggregateFunction>;
}

export function AggregationSettingsDropdown({
  value,
  onChange,
  selectedColumns,
  autoAggregations,
}: AggregationSettingsDropdownProps) {
  return (
    <div className='space-y-4 p-3'>
      <AggregationSection
        aggregations={value.aggregationConfig}
        dateTrunc={value.dateTruncConfig}
        selectedColumns={selectedColumns}
        autoAggregations={autoAggregations}
        onChange={(aggregationConfig, dateTruncConfig) => {
          onChange({ ...value, aggregationConfig, dateTruncConfig });
        }}
      />
    </div>
  );
}

interface AggregationSectionProps {
  aggregations: AggregationRule[];
  dateTrunc: DateTruncRule[];
  selectedColumns: readonly AggregationDropdownColumn[];
  autoAggregations?: ReadonlyMap<string, ReportAggregateFunction>;
  onChange: (aggregations: AggregationRule[], dateTrunc: DateTruncRule[]) => void;
}

function AggregationSection({
  aggregations,
  dateTrunc,
  selectedColumns,
  autoAggregations,
  onChange,
}: AggregationSectionProps) {
  const [pendingColumn, setPendingColumn] = useState<AggregationDropdownColumn | null>(null);
  const columnByName = new Map(selectedColumns.map(c => [c.name, c]));
  // A column is "configured" once it carries an aggregate function OR a date bucket — both
  // surface as their own row here, so neither should be re-offered in the add picker.
  const configuredColumns = new Set([
    ...aggregations.map(a => a.column),
    ...dateTrunc.map(r => r.column),
  ]);

  // Selected columns whose resolved allowed set is non-empty and not already configured.
  const addableColumns = selectedColumns.filter(
    c => !configuredColumns.has(c.name) && allowedAggregationsFor(c).length > 0
  );

  function allowedFor(column: string): readonly ReportAggregateFunction[] {
    const col = columnByName.get(column);
    return col ? allowedAggregationsFor(col) : [];
  }

  // Only columns still in the projection. The resolver stops predicting the moment a real rule
  // exists, so these never collide with the rows below.
  const autoApplied: [string, ReportAggregateFunction][] = [
    ...(autoAggregations ?? new Map<string, ReportAggregateFunction>()),
  ].filter(([column]) => columnByName.has(column));

  return (
    <div data-slot='aggregation-settings-panel'>
      <SectionHeader title='Aggregations' info={SECTION_INFO.aggregate} />
      {autoApplied.length > 0 && (
        <div
          data-testid='auto-aggregation-note'
          className='text-muted-foreground mb-2 flex items-start gap-2 text-xs'
        >
          {/* The same mark the Aggregations button carries, so the two read as one statement.
              Not an alert: nothing went wrong, the product simply chose and is saying so. */}
          <span className='bg-warning mt-1 size-1.5 shrink-0 rounded-full' aria-hidden='true' />
          <span>
            Applied automatically because this report sets none:{' '}
            {autoApplied.map(([column, fn], index) => (
              <span key={column}>
                {index > 0 && ', '}
                <span className='text-foreground font-medium'>
                  {columnByName.get(column)?.label ?? column}
                </span>
                {` \u2014 ${REPORT_AGGREGATE_FUNCTION_LABELS[fn]}`}
              </span>
            ))}
            . Add one below to decide for yourself.
          </span>
        </div>
      )}
      <div className='space-y-1'>
        {aggregations.map((rule, index) => {
          const col = columnByName.get(rule.column);
          return (
            <AggregationRow
              key={`${rule.column}|${rule.function}|${index}`}
              rule={rule}
              fieldType={col?.type ?? 'STRING'}
              allowedAggregations={allowedFor(rule.column)}
              allowDateBucket={!col?.isAggregateLevelCalculated}
              allowBucketTimeZone={!col?.isCalculated}
              columnFunctions={functionsForColumn(rule.column, aggregations)}
              displayLabel={col?.label}
              dataMartName={col?.dataMartName}
              onApplyDraft={draft => {
                const next = applyAggregationDraft(rule.column, draft, aggregations, dateTrunc);
                onChange(next.aggregationConfig, next.dateTruncConfig);
              }}
              onRemove={() => {
                onChange(
                  aggregations.filter((_, i) => i !== index),
                  dateTrunc
                );
              }}
            />
          );
        })}
        {dateTrunc.map((rule, index) => {
          const col = columnByName.get(rule.column);
          // Orphaned once the column is gone, no longer a date/timestamp type, or never a
          // grouping key at all. The last is the aggregate-level formula: its rule can never be
          // saved, and unlike an aggregation rule it has no empty allowed set to render it an
          // orphan on its own, so the refusal has to be spelled out here.
          const orphaned = !col || !isDateType(col.type) || !!col.isAggregateLevelCalculated;
          return (
            <DateTruncRow
              key={`bucket|${rule.column}|${index}`}
              rule={rule}
              isOrphaned={orphaned}
              fieldType={col?.type ?? 'DATE'}
              allowedAggregations={allowedFor(rule.column)}
              allowBucketTimeZone={!col?.isCalculated}
              displayLabel={col?.label}
              dataMartName={col?.dataMartName}
              onApplyDraft={draft => {
                const next = applyAggregationDraft(rule.column, draft, aggregations, dateTrunc);
                onChange(next.aggregationConfig, next.dateTruncConfig);
              }}
              onRemove={() => {
                onChange(
                  aggregations,
                  dateTrunc.filter((_, i) => i !== index)
                );
              }}
            />
          );
        })}
      </div>
      <div className='mt-2'>
        {pendingColumn ? (
          <RowAggregationIcon
            key={pendingColumn.name}
            column={pendingColumn.name}
            fieldType={pendingColumn.type}
            displayLabel={pendingColumn.label}
            dataMartName={pendingColumn.dataMartName}
            allowedAggregations={allowedAggregationsFor(pendingColumn)}
            allowDateBucket={!pendingColumn.isAggregateLevelCalculated}
            allowBucketTimeZone={!pendingColumn.isCalculated}
            activeFunctions={functionsForColumn(pendingColumn.name, aggregations)}
            activeBucket={bucketForColumn(pendingColumn.name, dateTrunc)}
            alwaysVisible
            autoOpen
            onClose={() => {
              setPendingColumn(null);
            }}
            onApplyDraft={draft => {
              const next = applyAggregationDraft(
                pendingColumn.name,
                draft,
                aggregations,
                dateTrunc
              );
              onChange(next.aggregationConfig, next.dateTruncConfig);
              setPendingColumn(null);
            }}
          />
        ) : addableColumns.length === 0 ? (
          <span className='text-muted-foreground text-xs'>No aggregatable columns.</span>
        ) : (
          <FieldSearchPicker
            items={addableColumns.map(columnToPickerItem)}
            placeholder='Add aggregation'
            onSelect={name => {
              const column = addableColumns.find(c => c.name === name);
              if (column) setPendingColumn(column);
            }}
          />
        )}
      </div>
    </div>
  );
}
