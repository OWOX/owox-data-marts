import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Link2, Search } from 'lucide-react';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { AlertTriangle, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@owox/ui/components/skeleton';
import { NoAccessIndicator } from '../DataMartRelationships/NoAccessIndicator';
import { useBlendableSchema } from '../../../shared/hooks/useBlendableSchema';
import type {
  AvailableSource,
  BlendedField,
  BlendedGroup,
  NativeField,
  ReportAggregateFunction,
} from '../../../shared/types/relationship.types';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import {
  EMPTY_OUTPUT_CONFIG,
  hasAnyOutputControls,
  MAIN_UNIQUE_COUNT_SOURCE,
  type DateTruncUnit,
  type FilterRule,
  type JoinedSource,
  type JoinedSourceColumn,
  type ColumnConfigRepairOptions,
  type OutputConfig,
  type OutputConfigKey,
  type OutputConfigRepairOptions,
} from '../../../shared/types/output-config';
import { supportsOutputControls } from '../../../shared/utils/output-controls-support';
import { FieldInfoTooltip } from './FieldInfoTooltip';
import { OutputSettingsButton } from './OutputSettingsButton';
import { OutputSettingsDropdown } from './OutputSettingsDropdown';
import type { OutputSettingsDropdownColumn } from './OutputSettingsDropdown';
import { AggregationSettingsButton } from './AggregationSettingsButton';
import { AggregationSettingsDropdown } from './AggregationSettingsDropdown';
import type { AggregationDropdownColumn } from './AggregationSettingsDropdown';
import { fieldDisplayLabel } from './output-controls-display';
import {
  buildJoinedUniqueCountColumnName,
  UNIQUE_COUNT_LABEL,
} from '../../../shared/utils/aggregation-labels';
import {
  canKeepUniqueCount,
  canOfferUniqueCount,
  classifyMainUniqueCountAvailability,
  uniqueCountDescription,
  mainUniqueCountState,
  readJoinedUniqueCountState,
  type JoinedUniqueCountState,
  type MainUniqueCountState,
  type UniqueCountSourceState,
} from '../../../shared/utils/unique-count-availability';
import { UniqueCountRow } from './UniqueCountRow';
import { RowFilterIcon } from './RowFilterIcon';
import { RowAggregationIcon } from './RowAggregationIcon';
import { effectiveComparisonType, isFilterableType } from './output-controls-operators';
import { resolveColumnAllowedAggregations } from '../../../shared/utils/aggregation-governance';
import { describeMissingReferences } from '../../../shared/utils/calculated-field-issues';
import { isRowLevelCalculatedField } from '../../../shared/utils/calculated-field-level';
import type { AggregationDraft } from './AggregationEditorPopover';
import {
  applyAggregationDraft,
  bucketForColumn,
  functionsForColumn,
  timeZoneForColumn,
} from './aggregation-config';
import { buildColumnSearchResult, matchesColumnSearch } from './report-column-search';
import { SearchButton } from './SearchButton';
import { PathTree } from './FieldSearchPicker';

// Must stay in sync with the backend collectSchemaFieldPaths walker: hidden and
// DISCONNECTED nodes (with their subtrees) are unavailable for reporting, so they
// are excluded from the list and surface in the Disconnected columns block instead.
function flattenNativeFields(fields: NativeField[], prefix = ''): NativeField[] {
  const result: NativeField[] = [];
  for (const field of fields) {
    // A calculated field carries a warehouse-derived status that means nothing for it (mirrors
    // the backend's own carve-out in `blendable-schema.service.ts`'s `flattenSchemaFields`) — it
    // is never sourced from the warehouse, so DISCONNECTED must not hide it.
    // `isHiddenForReporting` still applies to it: that is a real, separate governance
    // choice, not a warehouse-status artifact.
    if (field.isHiddenForReporting) continue;
    if (!field.calculated && field.status === 'DISCONNECTED') continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({
      name: fullName,
      // A REPEATED field's element type is not its comparison type — mark it as
      // ARRAY<T> so the operator menus mirror the backend validator (#6779).
      type: field.type ? effectiveComparisonType(field.type, field.mode) : field.type,
      alias: field.alias,
      description: field.description,
      isPrimaryKey: field.isPrimaryKey,
      aggregationRole: field.aggregationRole,
      allowedAggregations: field.allowedAggregations,
      calculated: field.calculated,
    });
    if (field.fields && Array.isArray(field.fields)) {
      result.push(...flattenNativeFields(field.fields, fullName));
    }
  }
  return result;
}

/**
 * The SQL output name of a source's Unique Count metric — what a sort rule stores and what the
 * backend emits as the column. The main mart's metric IS the label; a joined source's is derived
 * from its alias path, never from its free-form display prefix.
 */
function uniqueCountColumnName(source: string): string {
  return source === MAIN_UNIQUE_COUNT_SOURCE
    ? UNIQUE_COUNT_LABEL
    : buildJoinedUniqueCountColumnName(source);
}

/**
 * Display label of the main Data Mart's row — searched by, not the SQL name it emits. Same casing
 * as `UNIQUE_COUNT_LABEL` because the sort chip and the produced column both read `Unique Count`.
 */
const MAIN_UNIQUE_COUNT_ROW_LABEL = UNIQUE_COUNT_LABEL;

function joinedDataMartTitle(
  displayPrefix: string,
  nativeTitle: string,
  aliasPath: string
): string {
  return displayPrefix.trim() || nativeTitle || aliasPath;
}

export interface ReportColumnSelectionCount {
  selected: number;
  total: number;
}

export function ReportColumnsCountBadge({ count }: { count: ReportColumnSelectionCount }) {
  if (count.total === 0) return null;
  return (
    <Badge className='border-transparent bg-zinc-200 font-mono text-zinc-600 opacity-50 dark:bg-zinc-700 dark:text-zinc-300'>
      {count.selected}/{count.total}
    </Badge>
  );
}

export interface ReportColumnPickerProps {
  dataMartId: string;
  dataMartTitle: string;
  storageType?: DataStorageType;
  value: string[] | null;
  /**
   * `isRepair` carries the same meaning as on `onOutputConfigChange`: the picker materialised the
   * implicit "all native columns" projection on its own initiative, because a stored joined Unique
   * Count cannot be saved without an explicit one. Forms must apply it without dirtying.
   */
  onChange: (value: string[] | null, options?: ColumnConfigRepairOptions) => void;
  outputConfig?: OutputConfig;
  /**
   * `isRepair` marks a change the picker made on its OWN initiative — reconciling a stored config
   * against a schema that moved under it. Forms must apply it without marking themselves dirty, or
   * merely opening a report raises an "unsaved changes" guard.
   *
   * It carries the keys it actually rewrote: the picker widens an unset control to `[]` for its own
   * use, and a form that stores keys separately must not write that back.
   */
  onOutputConfigChange?: (config: OutputConfig, options?: OutputConfigRepairOptions) => void;
  onCountChange?: (count: ReportColumnSelectionCount) => void;
}

/**
 * One column list feeds both dropdowns; each shape declares only the flags its surfaces read.
 * All three calculated-field flags are REQUIRED here, so a branch that builds a column without
 * deciding them fails to compile instead of silently reading as an ordinary column.
 */
type DropdownColumn = OutputSettingsDropdownColumn &
  AggregationDropdownColumn &
  Required<Pick<OutputSettingsDropdownColumn, 'isJoinedCalculated'>> &
  Required<Pick<AggregationDropdownColumn, 'isCalculated' | 'isAggregateLevelCalculated'>>;

type ToggleFieldFn = (name: string, checked: boolean) => void;
type AddFilterFn = (rule: FilterRule) => void;
type RemoveFilterAtFn = (globalIndex: number) => void;
type ReplaceFilterAtFn = (globalIndex: number, rule: FilterRule) => void;
type ApplyAggregationFn = (column: string, draft: AggregationDraft) => void;

interface ColumnFilters {
  rules: FilterRule[];
  indices: number[];
}

const EMPTY_COLUMN_FILTERS: ColumnFilters = { rules: [], indices: [] };

/**
 * Per-row aggregation state: the resolved allowed-set plus what's currently assigned.
 * `allowed` empty → the AGG icon is hidden (nothing can be aggregated/grouped).
 */
interface ColumnAggregation {
  allowed: readonly ReportAggregateFunction[];
  functions: readonly ReportAggregateFunction[];
  bucket: DateTruncUnit | null;
  timeZone: string | null;
  /** False only for an aggregate-level calculated field — see `dropdownColumns`. */
  allowDateBucket: boolean;
  /** False for EITHER level of calculated field — see `dropdownColumns`. */
  allowBucketTimeZone: boolean;
}

function renderRowAggregationIcon(
  fieldName: string,
  fieldType: string | undefined,
  displayLabel: string,
  dataMartName: string | undefined,
  agg: ColumnAggregation | undefined,
  onApplyAggregation?: ApplyAggregationFn
) {
  if (!onApplyAggregation || !fieldType || !agg || agg.allowed.length === 0) return null;
  return (
    <RowAggregationIcon
      column={fieldName}
      fieldType={fieldType}
      displayLabel={displayLabel}
      dataMartName={dataMartName}
      allowedAggregations={agg.allowed}
      allowDateBucket={agg.allowDateBucket}
      allowBucketTimeZone={agg.allowBucketTimeZone}
      activeFunctions={agg.functions}
      activeBucket={agg.bucket}
      activeTimeZone={agg.timeZone}
      onApplyDraft={draft => {
        onApplyAggregation(fieldName, draft);
      }}
    />
  );
}

interface NativeFieldRowProps {
  field: NativeField;
  checked: boolean;
  onToggleField: ToggleFieldFn;
  filterableType?: string;
  columnFilters: ColumnFilters;
  onAddFilter?: AddFilterFn;
  onRemoveFilterAt?: RemoveFilterAtFn;
  onReplaceFilterAt?: ReplaceFilterAtFn;
  aggregation?: ColumnAggregation;
  onApplyAggregation?: ApplyAggregationFn;
  /**
   * This metric's own broken-reference names — its formula names a field the schema no
   * longer has. `undefined`/empty means fine. Only consulted for a `field.calculated` row.
   */
  brokenReferences?: readonly string[];
}

/**
 * A broken calculated field blocks a NEW selection with a hint: `aria-disabled`, never the
 * `disabled` attribute, which would drop the control out of the tab order and take the explanation
 * with it, plus a focusable `TooltipTrigger` so the hint reaches keyboard and screen-reader users.
 *
 * An already-CHECKED row stays clickable, unlike `UniqueCountRow`, whose own effect prunes a stale
 * entry. A calculated field's selection lives in the plain `columnConfig` array that nothing else
 * prunes, so blocking the checkbox would leave a report stuck with no way to clear it.
 */
const CALCULATED_FIELD_TRIGGER_BASE_CLASS =
  'min-w-0 truncate text-left font-mono text-xs underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded';

const NativeFieldRow = memo(function NativeFieldRow({
  field,
  checked,
  onToggleField,
  filterableType,
  columnFilters,
  onAddFilter,
  onRemoveFilterAt,
  onReplaceFilterAt,
  aggregation,
  onApplyAggregation,
  brokenReferences,
}: NativeFieldRowProps) {
  const noteId = useId();
  const aggIcon =
    checked &&
    renderRowAggregationIcon(
      field.name,
      field.type,
      fieldDisplayLabel(field.alias, field.name),
      undefined,
      aggregation,
      onApplyAggregation
    );
  const filterIcon = filterableType && onAddFilter && onRemoveFilterAt && (
    <RowFilterIcon
      column={field.name}
      fieldType={filterableType}
      displayLabel={fieldDisplayLabel(field.alias, field.name)}
      activeRules={columnFilters.rules}
      onAdd={onAddFilter}
      onRemoveAt={localIndex => {
        onRemoveFilterAt(columnFilters.indices[localIndex]);
      }}
      onReplaceAt={
        onReplaceFilterAt
          ? (localIndex, rule) => {
              onReplaceFilterAt(columnFilters.indices[localIndex], rule);
            }
          : undefined
      }
    />
  );

  const isCalculated = !!field.calculated;
  const missing = isCalculated ? (brokenReferences ?? []) : [];
  // The naming sentence is shared with the Data Mart's own output schema, which words the same
  // verdict; only the call to action differs — a report's reader cannot fix the formula.
  const missingDescription = describeMissingReferences(missing);
  const hint = missingDescription
    ? `${missingDescription}\nReach your analyst to fix it.`
    : undefined;
  const blocksToggle = !!hint && !checked;
  const displayName = field.alias ?? field.name;
  const describedText = hint ? [hint, field.description].filter(Boolean).join('\n') : undefined;

  const checkbox = (
    <Checkbox
      checked={checked}
      className={cn(blocksToggle && 'cursor-not-allowed opacity-50')}
      aria-label={hint ? displayName : undefined}
      aria-disabled={blocksToggle ? true : undefined}
      aria-describedby={describedText ? noteId : undefined}
      onCheckedChange={c => {
        if (blocksToggle) return;
        onToggleField(field.name, c === true);
      }}
    />
  );

  const rowChildren = (
    <>
      {field.type && <span className='text-muted-foreground shrink-0 text-xs'>({field.type})</span>}
      {/* Fixed height: the actions are conditional, and a row that shows none would otherwise
          sit shorter than its neighbours and grow the moment one appears. */}
      <span className='ml-auto flex h-6 items-center'>
        <FieldInfoTooltip text={field.description} compact />
        {aggIcon}
        {filterIcon}
      </span>
    </>
  );

  // No hint: identical shape to every other plain field row (one <label> wrapping everything),
  // so this is the only branch most rows — and every existing row query in this file — ever hit.
  if (!hint) {
    return (
      <label
        data-slot='native-field-row'
        className='group/row hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1'
      >
        {checkbox}
        <span className='min-w-0 truncate font-mono text-xs' title={field.name}>
          {displayName}
        </span>
        {rowChildren}
      </label>
    );
  }

  // Hinted (a broken formula): a <div>, not a <label> — a label may own exactly one labelable
  // control, and the checkbox is already it; the trigger below is a second one. Same reasoning,
  // same shape, as `UniqueCountRow`.
  return (
    <>
      <div
        data-slot='native-field-row'
        className='group/row hover:bg-muted/50 flex min-w-0 items-center gap-2 rounded px-1 py-1'
      >
        {checkbox}
        <Tooltip>
          <TooltipTrigger
            type='button'
            title={field.name}
            className={cn(CALCULATED_FIELD_TRIGGER_BASE_CLASS, 'text-destructive')}
            {...(blocksToggle
              ? {}
              : {
                  onClick: () => {
                    onToggleField(field.name, !checked);
                  },
                })}
          >
            {displayName}
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs whitespace-pre-line'>
            {hint}
          </TooltipContent>
        </Tooltip>
        {rowChildren}
      </div>
      {/* Outside the row on purpose: inside the trigger it would be read a second time as part of
          its accessible name. */}
      {describedText && (
        <span id={noteId} className='sr-only whitespace-pre-line'>
          {describedText}
        </span>
      )}
    </>
  );
});

interface BlendedFieldRowProps {
  field: BlendedField;
  checked: boolean;
  onToggleField: ToggleFieldFn;
  filterableType?: string;
  columnFilters: ColumnFilters;
  onAddFilter?: AddFilterFn;
  onRemoveFilterAt?: RemoveFilterAtFn;
  onReplaceFilterAt?: ReplaceFilterAtFn;
  preJoinSlices: ColumnFilters;
  aggregation?: ColumnAggregation;
  onApplyAggregation?: ApplyAggregationFn;
  hoverClassName?: string;
  /**
   * If true, the row only exposes paths that remove existing references —
   * the checkbox cannot select an unchecked field, filter/slice add and
   * edit actions are hidden. Used for fields inside an inaccessible group
   * so users can clear stale references without creating new ones.
   */
  removeOnly?: boolean;
}

/**
 * Why a joined Data Mart's formula is refused here, in the words the backend's own refusal uses
 * (`joinedCalculatedFieldRefusals`). The refusal covers every surface a report can name a column on
 * — projection, filter, sort, aggregation, date bucket — so the row may only ever clear one.
 */
function joinedCalculatedHint(dataMartName: string): string {
  return (
    `A calculated field of ${dataMartName}: its formula belongs to that Data Mart and is not ` +
    'available here, so this report can only read that Data Mart’s real columns.\n' +
    'Remove it from the report, or add the same calculation to this Data Mart.'
  );
}

const BlendedFieldRow = memo(function BlendedFieldRow({
  field,
  checked,
  onToggleField,
  filterableType,
  columnFilters,
  onAddFilter,
  onRemoveFilterAt,
  onReplaceFilterAt,
  preJoinSlices,
  aggregation,
  onApplyAggregation,
  hoverClassName = 'hover:bg-muted/50',
  removeOnly = false,
}: BlendedFieldRowProps) {
  const noteId = useId();
  const dataMartName = field.outputPrefix.trim() || field.sourceDataMartTitle;
  const hint = field.isCalculated === true ? joinedCalculatedHint(dataMartName) : undefined;
  // Same shape as an inaccessible source's row: every path that could CREATE a reference is closed,
  // every path that removes one stays open — a saved selection is the analyst's to clear, and
  // nothing else prunes `columnConfig` for them.
  const isRemoveOnly = removeOnly || !!hint;
  const effectiveAddFilter = isRemoveOnly ? undefined : onAddFilter;
  const effectiveReplaceFilter = isRemoveOnly ? undefined : onReplaceFilterAt;
  const aggIcon =
    checked &&
    !isRemoveOnly &&
    renderRowAggregationIcon(
      field.name,
      field.type,
      fieldDisplayLabel(field.alias, field.originalFieldName),
      dataMartName,
      aggregation,
      onApplyAggregation
    );
  const filterIcon =
    filterableType &&
    onRemoveFilterAt &&
    (effectiveAddFilter !== undefined ||
      columnFilters.rules.length > 0 ||
      preJoinSlices.rules.length > 0) ? (
      <RowFilterIcon
        column={field.name}
        fieldType={filterableType}
        sliceFieldType={field.sourceFieldType ?? field.type}
        displayLabel={fieldDisplayLabel(field.alias, field.originalFieldName)}
        dataMartName={dataMartName}
        activeRules={columnFilters.rules}
        onAdd={effectiveAddFilter}
        onRemoveAt={localIndex => {
          onRemoveFilterAt(columnFilters.indices[localIndex]);
        }}
        onReplaceAt={
          effectiveReplaceFilter
            ? (localIndex, rule) => {
                effectiveReplaceFilter(columnFilters.indices[localIndex], rule);
              }
            : undefined
        }
        sliceIconProps={{
          unifiedFieldName: field.name,
          existingSlices: preJoinSlices.rules,
          existingSliceIndices: preJoinSlices.indices,
          onAddSlice: effectiveAddFilter,
          onRemoveSliceAt: onRemoveFilterAt,
          onReplaceSliceAt: effectiveReplaceFilter
            ? (localIndex, rule) => {
                effectiveReplaceFilter(preJoinSlices.indices[localIndex], rule);
              }
            : undefined,
        }}
      />
    ) : null;
  const displayName = field.alias || field.originalFieldName;
  const blocksToggle = !!hint && !checked;
  const describedText = hint ? [hint, field.description].filter(Boolean).join('\n') : undefined;

  const checkbox = (
    <Checkbox
      checked={checked}
      // `aria-disabled` where the refusal has something to say, and the `disabled` attribute only
      // where it does not: `disabled` drops the control out of the tab order and takes the
      // explanation with it. Same split `NativeFieldRow` and `UniqueCountRow` make.
      disabled={removeOnly && !hint && !checked}
      className={cn(blocksToggle && 'cursor-not-allowed opacity-50')}
      aria-label={hint ? displayName : undefined}
      aria-disabled={blocksToggle ? true : undefined}
      aria-describedby={describedText ? noteId : undefined}
      onCheckedChange={c => {
        if (blocksToggle) return;
        onToggleField(field.name, c === true);
      }}
    />
  );

  const rowChildren = (
    <>
      {field.type && <span className='text-muted-foreground shrink-0 text-xs'>({field.type})</span>}
      {/* Fixed height: the actions are conditional, and a row that shows none would otherwise
          sit shorter than its neighbours and grow the moment one appears. */}
      <span className='ml-auto flex h-6 items-center'>
        <FieldInfoTooltip text={field.description} compact />
        {aggIcon}
        {filterIcon}
      </span>
    </>
  );

  // No hint: the shape every joined row has always had, one <label> wrapping everything.
  if (!hint) {
    return (
      <label
        data-slot='blended-field-row'
        className={cn(
          'group/row flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1',
          hoverClassName
        )}
      >
        {checkbox}
        <span className='min-w-0 truncate font-mono text-xs' title={field.name}>
          {displayName}
        </span>
        {rowChildren}
      </label>
    );
  }

  // Hinted: a <div>, not a <label> — a label may own exactly one labelable control and the
  // checkbox is already it. Same shape, same reasoning, as `NativeFieldRow`'s hinted branch.
  return (
    <>
      <div
        data-slot='blended-field-row'
        className={cn(
          'group/row flex min-w-0 items-center gap-2 rounded px-1 py-1',
          hoverClassName
        )}
      >
        {checkbox}
        <Tooltip>
          <TooltipTrigger
            type='button'
            title={field.name}
            className={CALCULATED_FIELD_TRIGGER_BASE_CLASS}
            {...(blocksToggle
              ? {}
              : {
                  onClick: () => {
                    onToggleField(field.name, !checked);
                  },
                })}
          >
            {displayName}
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs whitespace-pre-line'>
            {hint}
          </TooltipContent>
        </Tooltip>
        {rowChildren}
      </div>
      {/* Outside the row on purpose: inside the trigger it would be read a second time as part of
          its accessible name. */}
      <span id={noteId} className='sr-only whitespace-pre-line'>
        {describedText}
      </span>
    </>
  );
});

/**
 * Everything the group needs to render its source's Unique Count row; absent → no row. Derived from
 * the group's own shape rather than restated: a field added there but forgotten here would still
 * compile and just never reach the row.
 */
type GroupUniqueCount = NonNullable<BlendedGroup['uniqueCount']> & {
  state: UniqueCountSourceState | undefined;
  onCheckedChange: (checked: boolean) => void;
};

interface BlendedGroupItemProps {
  group: BlendedGroup;
  joinPath: readonly string[];
  selectedSet: Set<string>;
  onToggleField: ToggleFieldFn;
  filterableTypeFor?: (fieldName: string) => string | undefined;
  filtersByColumn?: Map<string, ColumnFilters>;
  onAddFilter?: AddFilterFn;
  onRemoveFilterAt?: RemoveFilterAtFn;
  onReplaceFilterAt?: ReplaceFilterAtFn;
  preJoinByAliasPathColumn?: Map<string, ColumnFilters>;
  aggregationByColumn?: Map<string, ColumnAggregation>;
  onApplyAggregation?: ApplyAggregationFn;
  hasSearchQuery?: boolean;
  uniqueCount?: GroupUniqueCount;
}

function JoinPathTooltip({
  dataMartName,
  path,
  joinDescription,
}: {
  dataMartName: string;
  path: readonly string[];
  /** Effective analyst-written business description of this join node, when set. */
  joinDescription?: string;
}) {
  if (path.length < 2) return null;
  return (
    <Tooltip delayDuration={600}>
      <TooltipTrigger asChild>
        <button
          type='button'
          aria-label={`Show join path for ${dataMartName}`}
          className='text-muted-foreground hover:text-foreground inline-flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/data-mart:opacity-100 focus-visible:opacity-100'
        >
          <Link2 className='size-4 shrink-0' aria-hidden='true' />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side='top'
        align='start'
        collisionPadding={8}
        className='max-h-64 max-w-sm overflow-auto overscroll-contain whitespace-nowrap'
        onWheel={event => {
          const tooltip = event.currentTarget;
          if (
            tooltip.scrollWidth > tooltip.clientWidth &&
            tooltip.scrollHeight <= tooltip.clientHeight &&
            Math.abs(event.deltaY) > Math.abs(event.deltaX)
          ) {
            tooltip.scrollLeft += event.deltaY;
          }
        }}
      >
        <PathTree segments={path} />
        {joinDescription && (
          <p className='border-border/50 mt-1.5 max-w-64 border-t pt-1.5 whitespace-pre-wrap'>
            {joinDescription}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function BlendedGroupItem({
  group,
  joinPath,
  selectedSet,
  onToggleField,
  filterableTypeFor,
  filtersByColumn,
  onAddFilter,
  onRemoveFilterAt,
  onReplaceFilterAt,
  preJoinByAliasPathColumn,
  aggregationByColumn,
  onApplyAggregation,
  hasSearchQuery = false,
  uniqueCount,
}: BlendedGroupItemProps) {
  // Also open when the source's Unique Count is on: an excluded source contributes no selected
  // field, so a collapsed group would hide the only control that can clear it.
  const [isOpen, setIsOpen] = useState(
    () => group.selectedCount > 0 || group.uniqueCount?.checked === true
  );
  const inaccessible = !group.isAccessibleForReporting;
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  const accentClass = inaccessible ? 'text-destructive' : 'text-muted-foreground';
  const previousHasSearchQuery = useRef(false);

  useEffect(() => {
    if (!previousHasSearchQuery.current && hasSearchQuery) {
      setIsOpen(true);
    }

    previousHasSearchQuery.current = hasSearchQuery;
  }, [hasSearchQuery]);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('rounded', inaccessible && 'border-destructive bg-destructive/10 border')}
    >
      <div
        className={cn(
          'group/data-mart flex w-full items-start gap-1.5 rounded px-1 py-1 transition-colors',
          !inaccessible &&
            'bg-secondary/50 dark:bg-muted/50 hover:bg-secondary/80 dark:hover:bg-muted/80'
        )}
      >
        <button
          type='button'
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group.alias}`}
          className='flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 text-left'
          onClick={() => {
            setIsOpen(v => !v);
          }}
        >
          <Chevron className={cn('mt-0.5 h-4 w-4 shrink-0', accentClass)} />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs font-semibold',
              inaccessible && 'text-destructive'
            )}
            title={group.alias}
          >
            {group.alias}
          </span>
          {inaccessible && <NoAccessIndicator variant='destructive' className='mt-0.5' />}
        </button>
        <span className='mt-0.5 flex shrink-0 items-center'>
          <FieldInfoTooltip text={group.description} compact dataMartHeader label={group.alias} />
          <JoinPathTooltip
            dataMartName={group.alias}
            path={joinPath}
            joinDescription={group.joinDescription}
          />
        </span>
      </div>
      <CollapsibleContent>
        {group.visibleFields.map(field => {
          return (
            <BlendedFieldRow
              key={field.name}
              field={field}
              checked={selectedSet.has(field.name)}
              onToggleField={onToggleField}
              filterableType={filterableTypeFor?.(field.name)}
              columnFilters={filtersByColumn?.get(field.name) ?? EMPTY_COLUMN_FILTERS}
              onAddFilter={onAddFilter}
              onRemoveFilterAt={onRemoveFilterAt}
              onReplaceFilterAt={onReplaceFilterAt}
              preJoinSlices={preJoinByAliasPathColumn?.get(field.name) ?? EMPTY_COLUMN_FILTERS}
              aggregation={aggregationByColumn?.get(field.name)}
              onApplyAggregation={onApplyAggregation}
              hoverClassName={inaccessible ? 'hover:bg-destructive/20' : undefined}
              removeOnly={inaccessible}
            />
          );
        })}
        {/* Inaccessible groups may only clear existing references, never create new ones. */}
        {uniqueCount && (!inaccessible || uniqueCount.checked) && (
          <UniqueCountRow
            {...uniqueCount}
            hoverClassName={inaccessible ? 'hover:bg-destructive/20' : undefined}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ReportColumnPicker({
  dataMartId,
  dataMartTitle,
  storageType,
  value,
  onChange,
  outputConfig,
  onOutputConfigChange,
  onCountChange,
}: ReportColumnPickerProps) {
  const outputControlsSupported = storageType ? supportsOutputControls(storageType) : false;
  const outputControlsAvailable: boolean = outputControlsSupported && !!onOutputConfigChange;
  const effectiveOutputConfig: OutputConfig = outputConfig ?? EMPTY_OUTPUT_CONFIG;

  type ActivePanel = 'aggregation' | 'output' | 'search' | null;
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const settingsOpen = activePanel === 'output';
  const aggSettingsOpen = activePanel === 'aggregation';
  const isSearchOpen = activePanel === 'search';
  const togglePanel = (panel: Exclude<ActivePanel, null>) => {
    setActivePanel(current => (current === panel ? null : panel));
  };

  const { data: schema, isLoading } = useBlendableSchema(dataMartId);

  const nativeFields = useMemo<NativeField[]>(
    () => (schema ? flattenNativeFields(schema.nativeFields as NativeField[]) : []),
    [schema]
  );

  // Every native field that is calculated, by NAME, so consumers below can test membership without
  // re-walking the schema. Declared early because several of them read it in a dependency array,
  // which is evaluated at render time rather than when the callback runs.
  const calculatedFieldNames = useMemo(
    () => new Set(nativeFields.filter(f => f.calculated).map(f => f.name)),
    [nativeFields]
  );

  // The backend's own verdict, not a client-side re-derivation: `brokenReferencesOf`
  // resolves a formula against the Data Mart's RAW schema, deliberately keeping a field hidden for
  // reporting as a valid reference — this picker's own `nativeFields` has already had those
  // stripped, so reproducing the check here would misreport every metric over a hidden column as
  // broken. Keyed by field name; a metric absent from the map has no issue.
  const calculatedFieldIssuesByName = useMemo(
    () => new Map((schema?.calculatedFieldIssues ?? []).map(issue => [issue.field, issue.missing])),
    [schema]
  );

  // The backend's own answer, not a mirror: it decides from the RAW schema, so it counts a key
  // column hidden for reporting — which `nativeFields` no longer carries at all. An older payload
  // has no such field; falling back to the visible keys is exactly what that backend counted.
  const mainPrimaryKeyFields = useMemo(
    () =>
      schema?.mainUniqueCountKeyFields ??
      nativeFields.filter(f => f.isPrimaryKey === true).map(f => f.name),
    [schema, nativeFields]
  );
  const hasReportablePrimaryKey = mainPrimaryKeyFields.length > 0;

  // Why each source can or cannot offer the Unique Count metric. Two separately-typed holders
  // rather than one map: the main mart and a joined source are decided by different backend rules
  // that share vocabulary, and only the tagged states keep one from being stored as the other.
  //
  // Absent means absent from the schema, which is what pruning acts on. EXCLUDED sources stay —
  // exclusion is reversible — but the backend does drop an excluded source's Unique Count, so its
  // row keeps rendering to say so and let the user clear it.
  const mainUniqueCount = useMemo<MainUniqueCountState | undefined>(
    () =>
      schema
        ? mainUniqueCountState(classifyMainUniqueCountAvailability(hasReportablePrimaryKey))
        : undefined,
    [schema, hasReportablePrimaryKey]
  );

  const joinedUniqueCountBySource = useMemo(() => {
    const map = new Map<string, JoinedUniqueCountState>();
    if (!schema) return map;
    for (const source of schema.availableSources) {
      map.set(source.aliasPath, readJoinedUniqueCountState(source.uniqueCountAvailability));
    }
    return map;
  }, [schema]);

  const uniqueCountStateFor = useCallback(
    (source: string): UniqueCountSourceState | undefined =>
      source === MAIN_UNIQUE_COUNT_SOURCE ? mainUniqueCount : joinedUniqueCountBySource.get(source),
    [mainUniqueCount, joinedUniqueCountBySource]
  );

  // Whether the client has any reason to believe the source still supplies the metric — the gate
  // for KEEPING a stored selection. Deliberately wider than `uniqueCountIsEmitted` below: an
  // unrecognised payload value and an excluded source both stay, only a recognised failure or a
  // source the schema dropped entirely go.
  const uniqueCountCanKeep = useCallback(
    (source: string): boolean => canKeepUniqueCount(uniqueCountStateFor(source)),
    [uniqueCountStateFor]
  );

  const uniqueCountCanOffer = useCallback(
    (source: string): boolean => canOfferUniqueCount(uniqueCountStateFor(source)),
    [uniqueCountStateFor]
  );

  const includedPaths = useMemo(() => {
    if (!schema?.availableSources) return new Set<string>();
    return new Set(schema.availableSources.filter(s => s.isIncluded).map(s => s.aliasPath));
  }, [schema]);

  // Whether a source's Unique Count actually reaches the SELECT. Mirror of the backend
  // `resolveUniqueCountSources`, which drops a source that lost its primary key OR is excluded from
  // reporting — and of the validator's `emittablePaths`, the same predicate. The single source of
  // truth for the sort entries offered, the stale sort rules pruned, and the not-emitted marking on
  // the row: a name the picker refuses to offer is one it repairs and one no row promises.
  const uniqueCountIsEmitted = useCallback(
    (source: string): boolean =>
      uniqueCountCanKeep(source) &&
      (source === MAIN_UNIQUE_COUNT_SOURCE || includedPaths.has(source)),
    [uniqueCountCanKeep, includedPaths]
  );

  const includedBlendedFields = useMemo(() => {
    if (!schema) return [];
    return schema.blendedFields.filter(f => includedPaths.has(f.aliasPath) && !f.isHidden);
  }, [schema, includedPaths]);

  // A null `value` means "every native column, implicitly", and the backend's own implicit-all
  // resolution excludes every calculated field — one is composed only when asked for BY NAME.
  // Mirrored here because a metric ticked-but-not-selected would render checked while the backend
  // emits no such column, and would be written into `columnConfig` by the materialization effects
  // below, turning an unrelated action into a selection nobody asked for.
  const effectiveValue = useMemo<string[]>(() => {
    if (value !== null) return value;
    return nativeFields.filter(f => !f.calculated).map(f => f.name);
  }, [value, nativeFields]);

  const effectiveValueSet = useMemo(() => new Set(effectiveValue), [effectiveValue]);

  const includedBlendedNamesSet = useMemo(
    () => new Set(includedBlendedFields.map(f => f.name)),
    [includedBlendedFields]
  );

  // Excluded-source blended fields still resolve on the backend, but fields hidden
  // in the joined data marts setup are rejected by the report-run orphan check —
  // they must surface as disconnected alongside names absent from the schema.
  const knownFieldNames = useMemo(() => {
    const names = new Set(nativeFields.map(f => f.name));
    for (const field of schema?.blendedFields ?? []) {
      if (!field.isHidden) names.add(field.name);
    }
    return names;
  }, [nativeFields, schema]);

  // Unique Count requires a primary key, and a source whose PK is later removed keeps
  // round-tripping its stored key on every save while the backend rejects or silently drops it — a
  // trap the user cannot escape through the UI. Only the sources that can no longer supply the
  // metric are dropped; clearing the whole list would wipe selections that are still valid.
  //
  // A sort rule on a DROPPED source goes with it: once the name leaves `uniqueCountConfig` the
  // validator stops treating it as selected and every later save 400s. Keyed off the dropped
  // sources alone — an EXCLUDED source keeps its entry, so pruning its rule here would delete
  // something the user never asked to lose and cannot restore by re-including the source.
  //
  // Skipped when a real field owns the name — the rule then refers to that field, not the metric.
  //
  // Flagged `isRepair` because none of this is a user edit: it happens on open, before anyone has
  // touched the form. Marking the form dirty for it both raises a false "unsaved changes" guard and
  // stages a deletion the user never made. The row itself already explains why the metric is gone
  // (disabled with a hint on key loss, "not generated" when the source is excluded).
  useEffect(() => {
    if (!schema || !onOutputConfigChange) return;
    const keptSources = effectiveOutputConfig.uniqueCountConfig.filter(uniqueCountCanKeep);
    const strandedColumns = new Set(
      effectiveOutputConfig.uniqueCountConfig
        .filter(source => !uniqueCountCanKeep(source))
        .map(uniqueCountColumnName)
        .filter(name => !knownFieldNames.has(name))
    );
    const hasStrandedSort = effectiveOutputConfig.sortConfig.some(r =>
      strandedColumns.has(r.column)
    );
    const prunesSources = keptSources.length !== effectiveOutputConfig.uniqueCountConfig.length;
    // A JOINED source's Unique Count is built by the blended query builder, which needs an EXPLICIT
    // column projection — the backend refuses to save a null one. The toggle handler materializes it
    // for a source the user just enabled, but a report created through the API or MCP arrives with
    // the source already stored and a null projection, and only finds out on the failed save. Read
    // off the KEPT sources: materializing for one this very repair is dropping stages a change the
    // report does not need.
    const needsColumnProjection =
      value === null && keptSources.some(source => source !== MAIN_UNIQUE_COUNT_SOURCE);
    if (!prunesSources && !hasStrandedSort && !needsColumnProjection) {
      return;
    }
    if (needsColumnProjection) {
      onChange(effectiveValue, { isRepair: true });
    }
    if (!prunesSources && !hasStrandedSort) {
      return;
    }
    // Named per key rather than left for the form to diff: the config passed alongside carries all
    // six, and five of them are only there because the picker needed a value to read.
    const changed: OutputConfigKey[] = [
      ...(prunesSources ? (['uniqueCountConfig'] as const) : []),
      ...(hasStrandedSort ? (['sortConfig'] as const) : []),
    ];
    onOutputConfigChange(
      {
        ...effectiveOutputConfig,
        uniqueCountConfig: keptSources,
        sortConfig: hasStrandedSort
          ? effectiveOutputConfig.sortConfig.filter(r => !strandedColumns.has(r.column))
          : effectiveOutputConfig.sortConfig,
      },
      { isRepair: true, changed }
    );
  }, [
    schema,
    uniqueCountCanKeep,
    onOutputConfigChange,
    onChange,
    value,
    effectiveValue,
    effectiveOutputConfig,
    knownFieldNames,
  ]);

  const unresolvedColumns = useMemo(
    () => (schema ? effectiveValue.filter(name => !knownFieldNames.has(name)) : []),
    [schema, effectiveValue, knownFieldNames]
  );

  const unresolvedFilterOnlyColumns = useMemo(() => {
    if (!schema) return [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement === 'pre-join') continue;
      if (knownFieldNames.has(rule.column) || effectiveValueSet.has(rule.column)) continue;
      if (seen.has(rule.column)) continue;
      seen.add(rule.column);
      names.push(rule.column);
    }
    return names;
  }, [schema, effectiveOutputConfig.filterConfig, knownFieldNames, effectiveValueSet]);

  const knownSliceKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of schema?.blendedFields ?? []) {
      // Same exclusion as the Slices picker above, and it has to be here too: a slice rule on a
      // joined calculated field can never be saved, so counting it as KNOWN is what kept
      // `unresolvedSlices` silent about a report that already carries one.
      if (f.isCalculated === true) continue;
      if (!f.isHidden) keys.add(f.name);
    }
    return keys;
  }, [schema]);

  const unresolvedSlices = useMemo(() => {
    if (!schema) return [];
    // Slices run pre-join on the raw value, so their operator labels key off the raw
    // sourceFieldType, not the post-dedup effective `type` (kept for the filter section).
    const typeByName = new Map<string, { fieldType: string; sliceFieldType: string }>();
    for (const f of schema.blendedFields) {
      if (f.type) {
        typeByName.set(f.name, { fieldType: f.type, sliceFieldType: f.sourceFieldType ?? f.type });
      }
    }
    const seen = new Set<string>();
    const result: { column: string; fieldType?: string; sliceFieldType?: string }[] = [];
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement !== 'pre-join') continue;
      if (knownSliceKeys.has(rule.column) || seen.has(rule.column)) continue;
      seen.add(rule.column);
      const types = typeByName.get(rule.column);
      result.push({
        column: rule.column,
        fieldType: types?.fieldType,
        sliceFieldType: types?.sliceFieldType,
      });
    }
    return result;
  }, [schema, effectiveOutputConfig.filterConfig, knownSliceKeys]);

  const valueRef = useRef(effectiveValue);
  valueRef.current = effectiveValue;

  const availableSourceByPath = useMemo(() => {
    const map = new Map<string, AvailableSource>();
    for (const source of schema?.availableSources ?? []) {
      map.set(source.aliasPath, source);
    }
    return map;
  }, [schema?.availableSources]);

  const joinPathFor = useCallback(
    (aliasPath: string): string[] => {
      const segments = aliasPath.split('.');
      const path = [dataMartTitle];
      for (let index = 0; index < segments.length; index += 1) {
        const technicalAlias = segments[index];
        const prefix = segments.slice(0, index + 1).join('.');
        const source = availableSourceByPath.get(prefix);
        path.push(
          source
            ? joinedDataMartTitle(source.defaultAlias, source.title, source.aliasPath)
            : technicalAlias
        );
      }
      return path;
    },
    [availableSourceByPath, dataMartTitle]
  );

  const accessibleBlendedFieldNames = useMemo(
    () =>
      includedBlendedFields
        .filter(f => availableSourceByPath.get(f.aliasPath)?.isAccessibleForReporting === true)
        .map(f => f.name),
    [includedBlendedFields, availableSourceByPath]
  );

  const selectableFieldNames = useMemo(
    () => [...nativeFields.map(f => f.name), ...accessibleBlendedFieldNames],
    [nativeFields, accessibleBlendedFieldNames]
  );

  // Order a selection by the picker's DISPLAY order (selectable fields in schema/group order,
  // then any preserved non-selectable names) so the report's column order matches what the
  // user sees top-to-bottom — not the order fields were toggled on.
  const orderBySelectable = useCallback(
    (names: string[]): string[] => {
      const wanted = new Set(names);
      const selectableSet = new Set(selectableFieldNames);
      const ordered = selectableFieldNames.filter(name => wanted.has(name));
      const preserved = names.filter(name => !selectableSet.has(name));
      return [...ordered, ...preserved];
    },
    [selectableFieldNames]
  );

  const toggleField = useCallback<ToggleFieldFn>(
    (fieldName, checked) => {
      const current = valueRef.current;
      if (checked) {
        if (current.includes(fieldName)) return;
        onChange(orderBySelectable([...current, fieldName]));
      } else {
        onChange(orderBySelectable(current.filter(name => name !== fieldName)));
      }
    },
    [onChange, orderBySelectable]
  );

  const filtersByColumn = useMemo<Map<string, ColumnFilters>>(() => {
    const map = new Map<string, ColumnFilters>();
    effectiveOutputConfig.filterConfig.forEach((rule, idx) => {
      if (rule.placement === 'pre-join') return;
      const existing = map.get(rule.column);
      if (existing) {
        existing.rules.push(rule);
        existing.indices.push(idx);
      } else {
        map.set(rule.column, { rules: [rule], indices: [idx] });
      }
    });
    return map;
  }, [effectiveOutputConfig.filterConfig]);

  // Pre-join filters (slices) keyed by unified blended-field name (rule.column).
  const preJoinByAliasPathColumn = useMemo<Map<string, ColumnFilters>>(() => {
    const map = new Map<string, ColumnFilters>();
    effectiveOutputConfig.filterConfig.forEach((rule, idx) => {
      if (rule.placement !== 'pre-join') return;
      const key = rule.column;
      const existing = map.get(key);
      if (existing) {
        existing.rules.push(rule);
        existing.indices.push(idx);
      } else {
        map.set(key, { rules: [rule], indices: [idx] });
      }
    });
    return map;
  }, [effectiveOutputConfig.filterConfig]);

  // Hidden blended fields included so disconnected filter rows show their real type.
  const fieldTypeByName = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const f of nativeFields) {
      if (f.type) map.set(f.name, f.type);
    }
    for (const f of schema?.blendedFields ?? []) {
      if (f.type) map.set(f.name, f.type);
    }
    return map;
  }, [nativeFields, schema]);

  const filterableTypeFor = useCallback(
    (fieldName: string): string | undefined => {
      if (!outputControlsAvailable) return undefined;
      // A calculated field of THIS Data Mart is filterable at either level: the
      // refusal that used to stand here described a SELECT-list alias, but a predicate's left-hand
      // side is the formula itself. The declared type is returned untouched — the operator menu is
      // the one the type resolves to, exactly as for an ordinary column. A JOINED Data
      // Mart's formula is refused instead by `BlendedFieldRow`'s remove-only path, which keeps an
      // already-saved rule clearable; suppressing its type here would take that away too.
      const t = fieldTypeByName.get(fieldName);
      if (!t) return undefined;
      return isFilterableType(t) ? t : undefined;
    },
    [outputControlsAvailable, fieldTypeByName]
  );

  const handleAddFilter = useCallback<AddFilterFn>(
    rule => {
      if (!onOutputConfigChange) return;
      onOutputConfigChange({
        ...effectiveOutputConfig,
        filterConfig: [...effectiveOutputConfig.filterConfig, rule],
      });
    },
    [effectiveOutputConfig, onOutputConfigChange]
  );

  const handleRemoveFilterAt = useCallback<RemoveFilterAtFn>(
    globalIndex => {
      if (!onOutputConfigChange) return;
      onOutputConfigChange({
        ...effectiveOutputConfig,
        filterConfig: effectiveOutputConfig.filterConfig.filter((_, i) => i !== globalIndex),
      });
    },
    [effectiveOutputConfig, onOutputConfigChange]
  );

  const handleReplaceFilterAt = useCallback<ReplaceFilterAtFn>(
    (globalIndex, rule) => {
      if (!onOutputConfigChange) return;
      onOutputConfigChange({
        ...effectiveOutputConfig,
        filterConfig: effectiveOutputConfig.filterConfig.map((existing, i) =>
          i === globalIndex ? rule : existing
        ),
      });
    },
    [effectiveOutputConfig, onOutputConfigChange]
  );

  const toggleUniqueCountSource = useCallback(
    (source: string, checked: boolean) => {
      if (!onOutputConfigChange) return;
      const current = effectiveOutputConfig.uniqueCountConfig;
      if (checked === current.includes(source)) return;
      onOutputConfigChange({
        ...effectiveOutputConfig,
        uniqueCountConfig: checked
          ? [...current, source]
          : current.filter(existing => existing !== source),
      });
      // A JOINED source's Unique Count is built by the blended query builder, which requires an
      // EXPLICIT column projection: the backend rejects a null columnConfig with one. While
      // columns are still implicit ("all selected" = null — the default of a brand-new report),
      // materialize them to the current explicit selection so the report stays runnable.
      if (checked && source !== MAIN_UNIQUE_COUNT_SOURCE && value === null) {
        onChange(effectiveValue);
      }
    },
    [effectiveOutputConfig, onOutputConfigChange, value, onChange, effectiveValue]
  );

  const joinedSources = useMemo<JoinedSource[]>(() => {
    if (!schema) return [];
    const byPath = new Map<string, JoinedSource & { columns: JoinedSourceColumn[] }>();
    for (const source of schema.availableSources) {
      if (!source.isIncluded) continue;
      if (!source.isAccessibleForReporting) continue;
      byPath.set(source.aliasPath, {
        aliasPath: source.aliasPath,
        title: source.title,
        columns: [],
      });
    }
    for (const field of schema.blendedFields) {
      const entry = byPath.get(field.aliasPath);
      if (!entry || !field.type || field.isHidden) continue;
      // A JOINED Data Mart's calculated field is refused on every report surface, and the backend
      // says so with JOINED_CALCULATED_FIELD_UNSUPPORTED. Without this the Slices picker offered
      // one, it looked healthy all the way through Apply, and only Save failed — every other
      // surface in this file decides `isCalculated` explicitly, and this loop was the one that
      // never had to.
      if (field.isCalculated === true) continue;
      entry.dataMartName ??= field.outputPrefix.trim() || field.sourceDataMartTitle;
      entry.columns.push({
        id: field.name,
        name: field.originalFieldName,
        // joinedSources feeds the Output settings → Slices surface only. Slices run pre-join on the
        // raw value, so use the raw source type (not the post-dedup effective `field.type`).
        type: field.sourceFieldType ?? field.type,
        alias: field.alias,
      });
    }
    for (const entry of byPath.values()) {
      const seen = new Set<string>();
      entry.columns = entry.columns.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
    }
    return Array.from(byPath.values()).filter(s => s.columns.length > 0);
  }, [schema]);

  const dropdownColumns = useMemo<DropdownColumn[]>(() => {
    const cols: DropdownColumn[] = [];
    for (const f of nativeFields) {
      if (f.type) {
        // An AGGREGATE-level formula already IS an aggregate: not a dimension, so it is offered
        // neither an aggregation nor a date bucket. Both refusals are permanent for that level.
        const isAggregateLevelCalculated =
          !!f.calculated && !isRowLevelCalculatedField(f.calculated);
        cols.push({
          name: f.name,
          type: f.type,
          label: fieldDisplayLabel(f.alias, f.name),
          path: f.name.split('.'),
          aggregationRole: f.aggregationRole,
          // The empty set is forced rather than passed through from `f.allowedAggregations`
          // (usually unset, which would fall back to the type-derived default and offer one
          // anyway). A ROW-LEVEL field is a dimension a report may aggregate, so it
          // resolves like any other column. This override gates the per-row Σ icon and the
          // field's entry in the Aggregations panel's "add" picker.
          allowedAggregations: isAggregateLevelCalculated ? [] : f.allowedAggregations,
          isAggregateLevelCalculated,
          // Level-agnostic, and gates the bucket TIME ZONE alone — a row-level
          // formula buckets like the column beside it and is still refused the zone.
          isCalculated: !!f.calculated,
          // This Data Mart's own formula, so filterable at either level.
          isJoinedCalculated: false,
        });
      }
    }
    for (const f of includedBlendedFields) {
      if (!f.type) continue;
      if (!availableSourceByPath.get(f.aliasPath)?.isAccessibleForReporting) continue;
      // No LEVEL travels with a joined formula, and none is needed: the backend refuses one on
      // EVERY surface a report can name a column on, whichever level it turned out to be. So all
      // three flags are raised together, and the aggregation sets are forced empty rather than
      // left to the type-derived default — an entry offering nothing is what keeps it out of the Σ
      // menu and out of the Aggregations panel's own picker. `isCalculated` is required on the
      // wire; absent only on a response cached before it existed, which reads as an ordinary
      // column.
      const isCalculated = f.isCalculated === true;
      cols.push({
        name: f.name,
        type: f.type,
        label: fieldDisplayLabel(f.alias, f.originalFieldName),
        dataMartName: f.outputPrefix.trim() || f.sourceDataMartTitle,
        path: [...f.aliasPath.split('.'), f.originalFieldName],
        aggregationRole: f.aggregationRole,
        allowedAggregations: isCalculated ? [] : f.allowedAggregations,
        postJoinAggregations: isCalculated ? [] : f.postJoinAggregations,
        isCalculated,
        isAggregateLevelCalculated: isCalculated,
        isJoinedCalculated: isCalculated,
      });
    }
    return cols;
  }, [nativeFields, includedBlendedFields, availableSourceByPath]);

  const selectedDropdownColumns = useMemo(
    () => dropdownColumns.filter(c => effectiveValueSet.has(c.name)),
    [dropdownColumns, effectiveValueSet]
  );

  // The sources whose Unique Count is CONFIGURED and still able to supply the metric — what the
  // rows render as ticked. Deliberately wider than `uniqueCountIsEmitted`: an excluded source stays
  // here so its row keeps rendering and stays clearable, and its row is marked not-emitted instead.
  const activeUniqueCountSources = useMemo(() => {
    if (!outputControlsAvailable) return new Set<string>();
    return new Set(effectiveOutputConfig.uniqueCountConfig.filter(uniqueCountCanKeep));
  }, [outputControlsAvailable, effectiveOutputConfig.uniqueCountConfig, uniqueCountCanKeep]);

  // The synthetic Unique Count columns a sort rule may resolve to — one per source whose metric is
  // actually emitted, keyed by the SQL name and shown under the display label. Same
  // `uniqueCountIsEmitted` gate the pruning effect above uses, so a name this list refuses to offer
  // is always one that effect clears.
  //
  // A source whose SQL name a real schema field already owns is skipped on top of that (the backend
  // has a dedicated OUTPUT_COLUMN_NAME_COLLISION error for it): if that field is selected, appending
  // the synthetic would duplicate the entry and collide on FieldSearchPicker's `key={item.value}`;
  // if it is merely present, emitting the name would produce an ORDER BY ambiguous between the outer
  // SELECT alias and the base column, whose precedence is unspecified across dialects.
  const syntheticSortColumns = useMemo<OutputSettingsDropdownColumn[]>(() => {
    const cols: OutputSettingsDropdownColumn[] = [];
    // Two sources CAN land on one SQL name — the alias path `a.b` and a top-level alias `a_b` both
    // build `a_b__unique_count`. The backend refuses that save with OUTPUT_COLUMN_NAME_COLLISION,
    // but the picker still renders first, and two entries under one `key={item.value}` take
    // FieldSearchPicker down through the error boundary before the user can read the message.
    const taken = new Set<string>();
    for (const source of activeUniqueCountSources) {
      if (!uniqueCountIsEmitted(source)) continue;
      const name = uniqueCountColumnName(source);
      if (knownFieldNames.has(name) || taken.has(name)) continue;
      taken.add(name);
      const joined =
        source === MAIN_UNIQUE_COUNT_SOURCE ? undefined : availableSourceByPath.get(source);
      cols.push({
        name,
        type: 'INTEGER',
        // Bare, like the picker row. This list is FLAT, so the source is named on the second line
        // instead — same shape an ordinary joined field's entry has. Two joins to one Data Mart
        // share a display alias, so the alias path is what tells their entries apart.
        label: UNIQUE_COUNT_LABEL,
        ...(joined
          ? {
              dataMartName: joined.defaultAlias.trim() || joined.title,
              path: [...source.split('.'), UNIQUE_COUNT_LABEL],
            }
          : {}),
      });
    }
    return cols;
  }, [activeUniqueCountSources, uniqueCountIsEmitted, knownFieldNames, availableSourceByPath]);

  // Shared with the disconnected-controls badge so a suppressed synthetic can never be reported
  // as still supplying the column.
  const syntheticSortColumnNames = useMemo(
    () => new Set(syntheticSortColumns.map(c => c.name)),
    [syntheticSortColumns]
  );

  // Sort-ONLY column list. Unique Count is a synthetic COUNT(DISTINCT <pk>) metric, not a
  // projected field: it can be ordered by (the ORDER BY resolves to the SELECT alias), but a
  // filter or aggregation on it has no column to bind to and the backend rejects it. So it
  // must stay out of dropdownColumns / selectedDropdownColumns, which feed those surfaces.
  const sortColumns = useMemo(
    () =>
      syntheticSortColumns.length === 0
        ? selectedDropdownColumns
        : [...selectedDropdownColumns, ...syntheticSortColumns],
    [selectedDropdownColumns, syntheticSortColumns]
  );

  const controlsCount = useMemo(() => {
    return (
      effectiveOutputConfig.filterConfig.length +
      effectiveOutputConfig.sortConfig.length +
      (effectiveOutputConfig.limitConfig != null ? 1 : 0)
    );
  }, [effectiveOutputConfig]);

  // Badge = aggregation rules + date-trunc rules.
  const aggregationCount = useMemo(() => {
    return (
      effectiveOutputConfig.aggregationConfig.length + effectiveOutputConfig.dateTruncConfig.length
    );
  }, [effectiveOutputConfig]);

  const hasAnyAggregation = aggregationCount > 0;

  const handleApplyAggregation = useCallback<ApplyAggregationFn>(
    (column, draft) => {
      if (!onOutputConfigChange) return;
      const next = applyAggregationDraft(
        column,
        draft,
        effectiveOutputConfig.aggregationConfig,
        effectiveOutputConfig.dateTruncConfig
      );
      onOutputConfigChange({
        ...effectiveOutputConfig,
        aggregationConfig: next.aggregationConfig,
        dateTruncConfig: next.dateTruncConfig,
      });
      // Aggregated / date-bucketed reports require an EXPLICIT column projection: the backend
      // rejects a null columnConfig with aggregations (renderAggregatedSelect iterates the
      // column list). While columns are still implicit ("all selected" = null), materialize
      // them to the current explicit selection so the report stays saveable.
      if (
        (next.aggregationConfig.length > 0 || next.dateTruncConfig.length > 0) &&
        value === null
      ) {
        onChange(effectiveValue);
      }
    },
    [effectiveOutputConfig, onOutputConfigChange, value, onChange, effectiveValue]
  );

  // The Aggregations panel edits the same config but bypasses handleApplyAggregation, so it
  // needs the identical column-projection materialization: an aggregated / date-bucketed
  // report requires an explicit columnConfig, else the backend rejects a null one with
  // AGGREGATION_REQUIRES_COLUMN_CONFIG (most visible on a brand-new report, columns still null).
  const handleAggregationPanelChange = useCallback(
    (config: OutputConfig) => {
      if (!onOutputConfigChange) return;
      onOutputConfigChange(config);
      if (
        (config.aggregationConfig.length > 0 || config.dateTruncConfig.length > 0) &&
        value === null
      ) {
        onChange(effectiveValue);
      }
    },
    [onOutputConfigChange, value, onChange, effectiveValue]
  );

  // Resolved allowed-set + currently-assigned functions/bucket, keyed by column name.
  // Only selected, aggregatable columns get an entry — drives per-row AGG icon visibility.
  const aggregationByColumn = useMemo<Map<string, ColumnAggregation>>(() => {
    const map = new Map<string, ColumnAggregation>();
    for (const col of dropdownColumns) {
      if (!effectiveValueSet.has(col.name)) continue;
      const allowed = resolveColumnAllowedAggregations(col);
      if (allowed.length === 0) continue;
      map.set(col.name, {
        allowed,
        functions: functionsForColumn(col.name, effectiveOutputConfig.aggregationConfig),
        bucket: bucketForColumn(col.name, effectiveOutputConfig.dateTruncConfig),
        timeZone: timeZoneForColumn(col.name, effectiveOutputConfig.dateTruncConfig),
        allowDateBucket: !col.isAggregateLevelCalculated,
        // The two flags part company here, and only here: a row-level formula buckets like the
        // TIMESTAMP column beside it and is still refused the ZONE.
        allowBucketTimeZone: !col.isCalculated,
      });
    }
    return map;
  }, [
    dropdownColumns,
    effectiveValueSet,
    effectiveOutputConfig.aggregationConfig,
    effectiveOutputConfig.dateTruncConfig,
  ]);

  const hasDisconnectedOutputControls = useMemo(() => {
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement === 'pre-join') {
        if (!knownSliceKeys.has(rule.column)) {
          return true;
        }
      } else if (!knownFieldNames.has(rule.column)) {
        return true;
      }
    }

    return effectiveOutputConfig.sortConfig.some(rule => {
      // A real selected field resolves the sort regardless of its name — check that first so
      // a schema field literally named "Unique Count" is never hijacked by the synthetic case.
      if (effectiveValueSet.has(rule.column) && knownFieldNames.has(rule.column)) return false;
      // Otherwise a synthetic metric can still supply the column, matching the backend's
      // validateSort (which adds each enabled source's name to the selected set).
      return !syntheticSortColumnNames.has(rule.column);
    });
  }, [
    effectiveOutputConfig.filterConfig,
    effectiveOutputConfig.sortConfig,
    syntheticSortColumnNames,
    knownFieldNames,
    knownSliceKeys,
    effectiveValueSet,
  ]);

  const referencedFieldNames = useMemo(() => {
    const names = new Set<string>();
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement !== 'pre-join') names.add(rule.column);
    }
    for (const rule of effectiveOutputConfig.sortConfig) names.add(rule.column);
    return names;
  }, [effectiveOutputConfig.filterConfig, effectiveOutputConfig.sortConfig]);

  const referencedPreJoinKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement === 'pre-join') {
        keys.add(rule.column);
      }
    }
    return keys;
  }, [effectiveOutputConfig.filterConfig]);

  function selectAll() {
    if (!schema) return;
    const selectableSet = new Set(selectAllTargetNames);
    const preserved = effectiveValue.filter(name => !selectableSet.has(name));
    onChange([...selectAllTargetNames, ...preserved]);
  }

  function deselectAll() {
    if (!schema) return;
    const selectableSet = new Set(targetSelectableFieldNames);
    onChange(effectiveValue.filter(name => !selectableSet.has(name)));
  }

  const selectedNativeCount = nativeFields.filter(f => effectiveValueSet.has(f.name)).length;

  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const visibleNativeFields = showSelectedOnly
    ? nativeFields.filter(f => effectiveValueSet.has(f.name))
    : nativeFields;

  const selectedBlendedCount = effectiveValue.filter(name =>
    includedBlendedNamesSet.has(name)
  ).length;
  const selectedFieldsCount = selectedNativeCount + selectedBlendedCount + unresolvedColumns.length;
  const accessibleBlendedNamesSet = useMemo(
    () => new Set(accessibleBlendedFieldNames),
    [accessibleBlendedFieldNames]
  );
  const selectedInaccessibleBlendedCount = useMemo(
    () =>
      effectiveValue.filter(
        name => includedBlendedNamesSet.has(name) && !accessibleBlendedNamesSet.has(name)
      ).length,
    [effectiveValue, includedBlendedNamesSet, accessibleBlendedNamesSet]
  );
  const totalFieldsCount =
    selectableFieldNames.length + selectedInaccessibleBlendedCount + unresolvedColumns.length;

  useEffect(() => {
    onCountChange?.({ selected: selectedFieldsCount, total: totalFieldsCount });
  }, [selectedFieldsCount, totalFieldsCount, onCountChange]);

  const groupedBlendedFields = useMemo<BlendedGroup[]>(() => {
    const groupMap = new Map<string, BlendedGroup>();

    for (const field of includedBlendedFields) {
      let group = groupMap.get(field.aliasPath);
      if (!group) {
        const source = availableSourceByPath.get(field.aliasPath);
        group = {
          aliasPath: field.aliasPath,
          title: field.sourceDataMartTitle,
          alias: joinedDataMartTitle(
            field.outputPrefix,
            field.sourceDataMartTitle,
            field.aliasPath
          ),
          description: source?.description,
          joinDescription: source?.joinDescription,
          isAccessibleForReporting: source?.isAccessibleForReporting ?? false,
          visibleFields: [],
          selectedCount: 0,
        };
        groupMap.set(field.aliasPath, group);
      }
      const isSelected = effectiveValueSet.has(field.name);
      const isReferenced =
        isSelected || referencedFieldNames.has(field.name) || referencedPreJoinKeys.has(field.name);
      if (isSelected) group.selectedCount += 1;
      if (group.isAccessibleForReporting) {
        if (!showSelectedOnly || isReferenced) group.visibleFields.push(field);
      } else if (isReferenced) {
        group.visibleFields.push(field);
      }
    }

    // The Unique Count row belongs to the SOURCE, not to any of its fields, so it is attached
    // here rather than left to whichever field group happened to survive: otherwise the metric
    // vanishes under "Show selected only" and from search, and an EXCLUDED source (which has no
    // fields here at all) leaves a stored selection the backend drops with no row to clear it.
    if (outputControlsAvailable) {
      for (const source of schema?.availableSources ?? []) {
        const checked = activeUniqueCountSources.has(source.aliasPath);
        // An unchecked row is an offer — never make one on a source the report may not use, on one
        // whose verdict the client cannot read (it could neither invite nor explain), and hide it
        // under "Show selected only" like any unselected field.
        const offerable =
          source.isIncluded &&
          source.isAccessibleForReporting &&
          !showSelectedOnly &&
          uniqueCountCanOffer(source.aliasPath);
        if (!checked && !offerable) continue;
        let group = groupMap.get(source.aliasPath);
        if (!group) {
          group = {
            aliasPath: source.aliasPath,
            title: source.title,
            alias: joinedDataMartTitle(source.defaultAlias, source.title, source.aliasPath),
            description: source.description,
            joinDescription: source.joinDescription,
            isAccessibleForReporting: source.isAccessibleForReporting,
            visibleFields: [],
            selectedCount: 0,
          };
          groupMap.set(source.aliasPath, group);
        }
        const sourceName = source.defaultAlias.trim() || source.title;
        group.uniqueCount = {
          // Bare: the group header directly above already names the source.
          label: UNIQUE_COUNT_LABEL,
          description: uniqueCountDescription(sourceName, source.uniqueCountKeyFields ?? []),
          dataMartName: sourceName,
          checked,
          isEmitted: uniqueCountIsEmitted(source.aliasPath),
        };
      }
    }

    return Array.from(groupMap.values()).filter(
      g => g.visibleFields.length > 0 || g.uniqueCount !== undefined
    );
  }, [
    includedBlendedFields,
    showSelectedOnly,
    effectiveValueSet,
    availableSourceByPath,
    referencedFieldNames,
    referencedPreJoinKeys,
    outputControlsAvailable,
    schema,
    activeUniqueCountSources,
    uniqueCountIsEmitted,
    uniqueCountCanOffer,
  ]);

  // Search query state and derived search results.
  const [searchQuery, setSearchQuery] = useState('');
  const hasSearchQuery = searchQuery.trim().length > 0;

  useEffect(() => {
    if (!isSearchOpen) {
      setSearchQuery('');
    }
  }, [isSearchOpen]);

  const { visibleNativeFields: searchedNativeFields, visibleBlendedGroups: searchedBlendedGroups } =
    useMemo(
      () => buildColumnSearchResult(visibleNativeFields, groupedBlendedFields, searchQuery),
      [visibleNativeFields, groupedBlendedFields, searchQuery]
    );

  const visibleUnresolvedColumns = useMemo(
    () => unresolvedColumns.filter(column => matchesColumnSearch(column, searchQuery)),
    [unresolvedColumns, searchQuery]
  );

  const visibleUnresolvedFilterOnlyColumns = useMemo(
    () => unresolvedFilterOnlyColumns.filter(column => matchesColumnSearch(column, searchQuery)),
    [unresolvedFilterOnlyColumns, searchQuery]
  );

  const visibleUnresolvedSlices = useMemo(
    () => unresolvedSlices.filter(slice => matchesColumnSearch(slice.column, searchQuery)),
    [unresolvedSlices, searchQuery]
  );

  const targetSelectableFieldNames = useMemo(
    () => [
      ...searchedNativeFields.map(field => field.name),
      ...searchedBlendedGroups.flatMap(group => group.visibleFields.map(field => field.name)),
    ],
    [searchedNativeFields, searchedBlendedGroups]
  );

  // The names a BULK action must not add to the selection: a metric the backend has already told
  // us is broken, and a JOINED Data Mart's formula, which it refuses outright. `NativeFieldRow` and
  // `BlendedFieldRow` block a direct click on those for the same reasons; this is the bulk-path
  // twin of both guards, built off the SAME facts the rows read, so a field a row refuses to let a
  // user check by hand can never be swept in by "Select all" (or any bulk action added later).
  const calculatedFieldsBlockedFromFreshSelection = useMemo(() => {
    const blocked = new Set<string>();
    for (const name of calculatedFieldNames) {
      if (calculatedFieldIssuesByName.has(name)) blocked.add(name);
    }
    for (const field of includedBlendedFields) {
      if (field.isCalculated === true) blocked.add(field.name);
    }
    return blocked;
  }, [calculatedFieldNames, calculatedFieldIssuesByName, includedBlendedFields]);

  const selectAllTargetNames = targetSelectableFieldNames.filter(
    name => !calculatedFieldsBlockedFromFreshSelection.has(name)
  );

  const mainUniqueCountChecked = activeUniqueCountSources.has(MAIN_UNIQUE_COUNT_SOURCE);

  // The main Data Mart's row obeys the same two filters as every field row and every joined
  // Unique Count row: an unchecked one is an offer, so it goes under "Show selected only", and it
  // is matched by its own label. Without `schema` no availability has been established and the row
  // would claim a missing primary key it knows nothing about.
  const showMainUniqueCountRow =
    outputControlsAvailable &&
    !!schema &&
    (mainUniqueCountChecked || !showSelectedOnly) &&
    matchesColumnSearch(MAIN_UNIQUE_COUNT_ROW_LABEL, searchQuery);

  const hasVisibleColumns =
    searchedNativeFields.length > 0 ||
    searchedBlendedGroups.length > 0 ||
    visibleUnresolvedColumns.length > 0 ||
    visibleUnresolvedFilterOnlyColumns.length > 0 ||
    visibleUnresolvedSlices.length > 0 ||
    showMainUniqueCountRow;

  if (isLoading) {
    return (
      <div className='space-y-2'>
        <Skeleton className='h-4 w-32' />
        <Skeleton className='h-6 w-full' />
        <Skeleton className='h-6 w-full' />
        <Skeleton className='h-6 w-full' />
      </div>
    );
  }

  const allSelected =
    selectAllTargetNames.length > 0 &&
    selectAllTargetNames.every(name => effectiveValueSet.has(name));

  const showCapabilityFallback =
    !outputControlsSupported &&
    !!storageType &&
    !!outputConfig &&
    hasAnyOutputControls(outputConfig);

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between px-2'>
        <div className='flex items-center gap-2'>
          <label className='text-muted-foreground hover:text-foreground border-border flex cursor-pointer items-center gap-2 border-r pr-3 text-xs transition-colors'>
            <Checkbox
              checked={allSelected}
              onCheckedChange={checked => {
                if (checked === true) selectAll();
                else deselectAll();
              }}
              aria-label={allSelected ? 'Deselect all fields' : 'Select all fields'}
            />
            Select all
          </label>
          <label className='text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-xs transition-colors'>
            <Switch
              className='scale-75'
              checked={showSelectedOnly}
              onCheckedChange={setShowSelectedOnly}
            />
            Show selected only
          </label>
        </div>

        <div className='flex items-center gap-1'>
          {outputControlsAvailable && (
            <AggregationSettingsButton
              active={hasAnyAggregation}
              count={aggregationCount}
              open={aggSettingsOpen}
              onClick={() => {
                togglePanel('aggregation');
              }}
            />
          )}
          {outputControlsAvailable && (
            <OutputSettingsButton
              active={controlsCount > 0}
              count={controlsCount}
              hasDisconnectedControls={hasDisconnectedOutputControls}
              open={settingsOpen}
              onClick={() => {
                togglePanel('output');
              }}
            />
          )}
          <SearchButton
            open={isSearchOpen}
            onClick={() => {
              togglePanel('search');
            }}
          />
        </div>
      </div>

      {isSearchOpen && (
        <div className='relative' role='search'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
          <Input
            autoFocus
            value={searchQuery}
            placeholder='Search columns...'
            aria-label='Search columns'
            className='pl-8'
            onChange={event => {
              setSearchQuery(event.target.value);
            }}
          />
        </div>
      )}

      {settingsOpen && onOutputConfigChange && outputControlsSupported && (
        <div className='rounded-md border'>
          <OutputSettingsDropdown
            value={effectiveOutputConfig}
            onChange={onOutputConfigChange}
            sortColumns={sortColumns}
            allColumns={dropdownColumns}
            joinedSources={joinedSources}
          />
        </div>
      )}

      {aggSettingsOpen && onOutputConfigChange && outputControlsSupported && (
        <div className='rounded-md border'>
          <AggregationSettingsDropdown
            value={effectiveOutputConfig}
            onChange={handleAggregationPanelChange}
            selectedColumns={selectedDropdownColumns}
          />
        </div>
      )}

      {showCapabilityFallback && onOutputConfigChange && (
        <div className='m-2 flex items-center gap-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'>
          <AlertTriangle className='h-3 w-3 shrink-0' />
          <span className='flex-1'>
            Output controls are not yet supported for this storage type.
          </span>
          <Button
            variant='outline'
            size='sm'
            className='h-6 text-xs'
            onClick={() => {
              onOutputConfigChange(EMPTY_OUTPUT_CONFIG);
            }}
          >
            Clear
          </Button>
        </div>
      )}

      <div
        className={cn(
          'max-h-[32rem] space-y-1 overflow-y-auto rounded-md border p-1',
          selectedNativeCount === 0 ? 'border-destructive' : 'border-border'
        )}
      >
        {(visibleUnresolvedColumns.length > 0 ||
          visibleUnresolvedFilterOnlyColumns.length > 0 ||
          visibleUnresolvedSlices.length > 0) && (
          <div className='border-destructive bg-destructive/10 rounded border'>
            <div className='flex items-start gap-1.5 px-1 py-1'>
              <div className='min-w-0 flex-1'>
                <span className='text-destructive truncate text-xs font-semibold'>
                  Disconnected columns
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TriangleAlert
                    className='text-destructive mt-0.5 size-4 shrink-0'
                    aria-label='About disconnected columns'
                  />
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-xs'>
                  <div className='space-y-1'>
                    <p>
                      They are missing from the current Data Mart output schema. Uncheck them to
                      remove them from the report, or contact your analyst to restore the schema.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            {[
              ...visibleUnresolvedColumns.map(name => ({ name, selected: true })),
              ...visibleUnresolvedFilterOnlyColumns.map(name => ({ name, selected: false })),
            ].map(({ name, selected }) => {
              const columnFilters = filtersByColumn.get(name) ?? EMPTY_COLUMN_FILTERS;
              return (
                <label
                  key={name}
                  className='group/row hover:bg-destructive/20 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
                >
                  <Checkbox
                    checked={selected}
                    disabled={!selected}
                    onCheckedChange={() => {
                      if (selected) toggleField(name, false);
                    }}
                  />
                  <span className='font-mono text-xs'>{name}</span>
                  {outputControlsAvailable && columnFilters.rules.length > 0 && (
                    <RowFilterIcon
                      column={name}
                      fieldType={fieldTypeByName.get(name) ?? 'STRING'}
                      activeRules={columnFilters.rules}
                      onRemoveAt={localIndex => {
                        handleRemoveFilterAt(columnFilters.indices[localIndex]);
                      }}
                    />
                  )}
                </label>
              );
            })}
            {visibleUnresolvedSlices.map(({ column, fieldType, sliceFieldType }) => {
              const slices = preJoinByAliasPathColumn.get(column) ?? EMPTY_COLUMN_FILTERS;
              return (
                <label
                  key={column}
                  className='group/row hover:bg-destructive/20 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
                >
                  <Checkbox checked={false} disabled />
                  <span className='font-mono text-xs'>{column}</span>
                  {outputControlsAvailable && slices.rules.length > 0 && (
                    <RowFilterIcon
                      column={column}
                      fieldType={fieldType ?? 'STRING'}
                      sliceFieldType={sliceFieldType ?? fieldType ?? 'STRING'}
                      activeRules={EMPTY_COLUMN_FILTERS.rules}
                      onRemoveAt={() => undefined}
                      sliceIconProps={{
                        unifiedFieldName: column,
                        existingSlices: slices.rules,
                        existingSliceIndices: slices.indices,
                        onRemoveSliceAt: handleRemoveFilterAt,
                      }}
                    />
                  )}
                </label>
              );
            })}
          </div>
        )}
        {!hasVisibleColumns && (
          <p className='text-muted-foreground px-2 py-6 text-center text-sm'>
            {hasSearchQuery ? 'No matching columns found.' : 'No fields available.'}
          </p>
        )}
        {searchedNativeFields.map(field => (
          <NativeFieldRow
            key={field.name}
            field={field}
            checked={effectiveValueSet.has(field.name)}
            onToggleField={toggleField}
            filterableType={filterableTypeFor(field.name)}
            columnFilters={filtersByColumn.get(field.name) ?? EMPTY_COLUMN_FILTERS}
            onAddFilter={outputControlsAvailable ? handleAddFilter : undefined}
            onRemoveFilterAt={outputControlsAvailable ? handleRemoveFilterAt : undefined}
            onReplaceFilterAt={outputControlsAvailable ? handleReplaceFilterAt : undefined}
            aggregation={aggregationByColumn.get(field.name)}
            onApplyAggregation={outputControlsAvailable ? handleApplyAggregation : undefined}
            brokenReferences={calculatedFieldIssuesByName.get(field.name)}
          />
        ))}

        {showMainUniqueCountRow && (
          <UniqueCountRow
            label={MAIN_UNIQUE_COUNT_ROW_LABEL}
            // No Data Mart name to give it: the picker is never told the report's own mart title,
            // and no group header names it either.
            description={uniqueCountDescription(undefined, mainPrimaryKeyFields)}
            state={uniqueCountStateFor(MAIN_UNIQUE_COUNT_SOURCE)}
            checked={mainUniqueCountChecked}
            onCheckedChange={checked => {
              toggleUniqueCountSource(MAIN_UNIQUE_COUNT_SOURCE, checked);
            }}
          />
        )}

        {searchedBlendedGroups.map(group => {
          return (
            <BlendedGroupItem
              key={group.aliasPath}
              group={group}
              joinPath={joinPathFor(group.aliasPath)}
              selectedSet={effectiveValueSet}
              onToggleField={toggleField}
              filterableTypeFor={filterableTypeFor}
              filtersByColumn={filtersByColumn}
              onAddFilter={outputControlsAvailable ? handleAddFilter : undefined}
              onRemoveFilterAt={outputControlsAvailable ? handleRemoveFilterAt : undefined}
              onReplaceFilterAt={outputControlsAvailable ? handleReplaceFilterAt : undefined}
              preJoinByAliasPathColumn={preJoinByAliasPathColumn}
              aggregationByColumn={aggregationByColumn}
              onApplyAggregation={outputControlsAvailable ? handleApplyAggregation : undefined}
              hasSearchQuery={hasSearchQuery}
              uniqueCount={
                group.uniqueCount
                  ? {
                      ...group.uniqueCount,
                      state: uniqueCountStateFor(group.aliasPath),
                      onCheckedChange: checked => {
                        toggleUniqueCountSource(group.aliasPath, checked);
                      },
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {selectedNativeCount === 0 && selectedBlendedCount > 0 && (
        <p className='text-destructive text-sm'>
          At least one column from the current Data Mart must be selected
        </p>
      )}
    </div>
  );
}
