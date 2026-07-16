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
}

export function AggregationSettingsDropdown({
  value,
  onChange,
  selectedColumns,
}: AggregationSettingsDropdownProps) {
  // A lone date bucket also triggers the hint because bucketing implies grouping, making it an aggregated report.
  const hasAggregations = value.aggregationConfig.length > 0 || value.dateTruncConfig.length > 0;
  return (
    <div className='space-y-4 p-3'>
      <AggregationSection
        aggregations={value.aggregationConfig}
        dateTrunc={value.dateTruncConfig}
        selectedColumns={selectedColumns}
        onChange={(aggregationConfig, dateTruncConfig) => {
          onChange({ ...value, aggregationConfig, dateTruncConfig });
        }}
      />
      {hasAggregations && (
        <p className='text-muted-foreground text-xs'>
          A Row Count column is included automatically in aggregated reports.
        </p>
      )}
    </div>
  );
}

interface AggregationSectionProps {
  aggregations: AggregationRule[];
  dateTrunc: DateTruncRule[];
  selectedColumns: readonly AggregationDropdownColumn[];
  onChange: (aggregations: AggregationRule[], dateTrunc: DateTruncRule[]) => void;
}

function AggregationSection({
  aggregations,
  dateTrunc,
  selectedColumns,
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

  return (
    <div>
      <SectionHeader title='Aggregations' info={SECTION_INFO.aggregate} />
      <div className='space-y-1'>
        {aggregations.map((rule, index) => {
          const col = columnByName.get(rule.column);
          return (
            <AggregationRow
              key={`${rule.column}|${rule.function}|${index}`}
              rule={rule}
              fieldType={col?.type ?? 'STRING'}
              allowedAggregations={allowedFor(rule.column)}
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
          // Orphaned once the column is gone or no longer a date/timestamp type.
          const orphaned = !col || !isDateType(col.type);
          return (
            <DateTruncRow
              key={`bucket|${rule.column}|${index}`}
              rule={rule}
              isOrphaned={orphaned}
              fieldType={col?.type ?? 'DATE'}
              allowedAggregations={allowedFor(rule.column)}
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
