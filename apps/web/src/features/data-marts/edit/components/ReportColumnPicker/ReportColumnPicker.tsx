import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { AlertTriangle, ChevronDown, ChevronRight, Sigma, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@owox/ui/components/skeleton';
import { NoAccessIndicator } from '../DataMartRelationships/NoAccessIndicator';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';
import type {
  AggregationRole,
  AvailableSource,
  BlendedField,
  ReportAggregateFunction,
} from '../../../shared/types/relationship.types';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import {
  EMPTY_OUTPUT_CONFIG,
  hasAnyOutputControls,
  type DateTruncUnit,
  type FilterRule,
  type JoinedSource,
  type JoinedSourceColumn,
  type OutputConfig,
} from '../../../shared/types/output-config';
import { supportsOutputControls } from '../../../shared/utils/output-controls-support';
import { FieldInfoTooltip } from './FieldInfoTooltip';
import { OutputSettingsButton } from './OutputSettingsButton';
import { OutputSettingsDropdown } from './OutputSettingsDropdown';
import type { OutputSettingsDropdownColumn } from './OutputSettingsDropdown';
import { AggregationSettingsButton } from './AggregationSettingsButton';
import { AggregationSettingsDropdown } from './AggregationSettingsDropdown';
import { fieldDisplayLabel } from './output-controls-display';
import { RowFilterIcon } from './RowFilterIcon';
import { RowAggregationIcon } from './RowAggregationIcon';
import { isFilterableType } from './output-controls-operators';
import { resolveColumnAllowedAggregations } from '../../../shared/utils/aggregation-governance';
import type { AggregationDraft } from './AggregationEditorPopover';
import {
  applyAggregationDraft,
  bucketForColumn,
  functionsForColumn,
  timeZoneForColumn,
} from './aggregation-config';

interface NativeField {
  name: string;
  type?: string;
  alias?: string;
  description?: string;
  isHiddenForReporting?: boolean;
  status?: string;
  fields?: NativeField[];
  isPrimaryKey?: boolean;
  // Aggregation governance (optional; absent → type-derived defaults on the web).
  aggregationRole?: AggregationRole;
  allowedAggregations?: ReportAggregateFunction[];
}

// Must stay in sync with the backend collectSchemaFieldPaths walker: hidden and
// DISCONNECTED nodes (with their subtrees) are unavailable for reporting, so they
// are excluded from the list and surface in the Disconnected columns block instead.
function flattenNativeFields(fields: NativeField[], prefix = ''): NativeField[] {
  const result: NativeField[] = [];
  for (const field of fields) {
    if (field.isHiddenForReporting || field.status === 'DISCONNECTED') continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({
      name: fullName,
      type: field.type,
      alias: field.alias,
      description: field.description,
      isPrimaryKey: field.isPrimaryKey,
      aggregationRole: field.aggregationRole,
      allowedAggregations: field.allowedAggregations,
    });
    if (field.fields && Array.isArray(field.fields)) {
      result.push(...flattenNativeFields(field.fields, fullName));
    }
  }
  return result;
}

interface BlendedGroup {
  aliasPath: string;
  title: string;
  alias: string;
  description?: string;
  isAccessibleForReporting: boolean;
  visibleFields: BlendedField[];
  selectedCount: number;
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
  storageType?: DataStorageType;
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  outputConfig?: OutputConfig;
  onOutputConfigChange?: (config: OutputConfig) => void;
  onCountChange?: (count: ReportColumnSelectionCount) => void;
}

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
}

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
}: NativeFieldRowProps) {
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
  return (
    <label className='group/row group hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1'>
      <Checkbox
        checked={checked}
        onCheckedChange={c => {
          onToggleField(field.name, c === true);
        }}
      />
      <span className='min-w-0 truncate font-mono text-xs' title={field.name}>
        {field.alias ?? field.name}
      </span>
      {field.type && <span className='text-muted-foreground shrink-0 text-xs'>({field.type})</span>}
      <FieldInfoTooltip text={field.description} compact />
      <span className='ml-auto flex items-center'>
        {aggIcon}
        {filterIcon}
      </span>
    </label>
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
  const effectiveAddFilter = removeOnly ? undefined : onAddFilter;
  const effectiveReplaceFilter = removeOnly ? undefined : onReplaceFilterAt;
  const dataMartName = field.outputPrefix.trim() || field.sourceDataMartTitle;
  const aggIcon =
    checked &&
    !removeOnly &&
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
  return (
    <label
      className={cn(
        'group/row group flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1',
        hoverClassName
      )}
    >
      <Checkbox
        checked={checked}
        disabled={removeOnly && !checked}
        onCheckedChange={c => {
          onToggleField(field.name, c === true);
        }}
      />
      <span className='min-w-0 truncate font-mono text-xs' title={field.name}>
        {field.alias || field.originalFieldName}
      </span>
      {field.type && <span className='text-muted-foreground shrink-0 text-xs'>({field.type})</span>}
      <FieldInfoTooltip text={field.description} compact />
      <span className='ml-auto flex items-center'>
        {aggIcon}
        {filterIcon}
      </span>
    </label>
  );
});

interface BlendedGroupItemProps {
  group: BlendedGroup;
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
}

function BlendedGroupItem({
  group,
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
}: BlendedGroupItemProps) {
  const [isOpen, setIsOpen] = useState(() => group.selectedCount > 0);
  const inaccessible = !group.isAccessibleForReporting;
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  const accentClass = inaccessible ? 'text-destructive' : 'text-muted-foreground';

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('rounded', inaccessible && 'border-destructive bg-destructive/10 border')}
    >
      <button
        type='button'
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group.alias}`}
        className={cn(
          'group flex w-full cursor-pointer items-start gap-1.5 rounded px-1 py-1 text-left transition-colors',
          !inaccessible &&
            'bg-secondary/50 dark:bg-muted/50 hover:bg-secondary/80 dark:hover:bg-muted/80'
        )}
        onClick={() => {
          setIsOpen(v => !v);
        }}
      >
        <Chevron className={cn('mt-0.5 h-4 w-4 shrink-0', accentClass)} />
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <span
              className={cn('truncate text-xs font-semibold', inaccessible && 'text-destructive')}
              title={group.alias}
            >
              {group.alias}
            </span>
            <FieldInfoTooltip text={group.description} />
          </div>
        </div>
        {inaccessible && <NoAccessIndicator variant='destructive' className='mt-0.5' />}
      </button>
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
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ReportColumnPicker({
  dataMartId,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aggSettingsOpen, setAggSettingsOpen] = useState(false);
  const { data: schema, isLoading } = useQuery({
    queryKey: [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    queryFn: () => dataMartRelationshipService.getBlendableSchema(dataMartId),
    enabled: !!dataMartId,
  });

  const nativeFields = useMemo<NativeField[]>(
    () => (schema ? flattenNativeFields(schema.nativeFields as NativeField[]) : []),
    [schema]
  );

  const hasPrimaryKey = useMemo(
    () => nativeFields.some(f => f.isPrimaryKey === true),
    [nativeFields]
  );

  const includedPaths = useMemo(() => {
    if (!schema?.availableSources) return new Set<string>();
    return new Set(schema.availableSources.filter(s => s.isIncluded).map(s => s.aliasPath));
  }, [schema]);

  const includedBlendedFields = useMemo(() => {
    if (!schema) return [];
    return schema.blendedFields.filter(f => includedPaths.has(f.aliasPath) && !f.isHidden);
  }, [schema, includedPaths]);

  const effectiveValue = useMemo<string[]>(() => {
    if (value !== null) return value;
    return nativeFields.map(f => f.name);
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
      if (!f.isHidden) keys.add(f.name);
    }
    return keys;
  }, [schema]);

  const unresolvedSlices = useMemo(() => {
    if (!schema) return [];
    const typeByName = new Map<string, string>();
    for (const f of schema.blendedFields) {
      if (f.type) typeByName.set(f.name, f.type);
    }
    const seen = new Set<string>();
    const result: { column: string; fieldType?: string }[] = [];
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement !== 'pre-join') continue;
      if (knownSliceKeys.has(rule.column) || seen.has(rule.column)) continue;
      seen.add(rule.column);
      result.push({
        column: rule.column,
        fieldType: typeByName.get(rule.column),
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

  function selectAll() {
    if (!schema) return;
    const selectableSet = new Set(selectableFieldNames);
    const preserved = effectiveValue.filter(name => !selectableSet.has(name));
    onChange([...selectableFieldNames, ...preserved]);
  }

  function deselectAll() {
    if (!schema) return;
    const selectableSet = new Set(selectableFieldNames);
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
      entry.dataMartName ??= field.outputPrefix.trim() || field.sourceDataMartTitle;
      entry.columns.push({
        id: field.name,
        name: field.originalFieldName,
        type: field.type,
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

  const dropdownColumns = useMemo<OutputSettingsDropdownColumn[]>(() => {
    const cols: OutputSettingsDropdownColumn[] = [];
    for (const f of nativeFields) {
      if (f.type) {
        cols.push({
          name: f.name,
          type: f.type,
          label: fieldDisplayLabel(f.alias, f.name),
          path: f.name.split('.'),
          aggregationRole: f.aggregationRole,
          allowedAggregations: f.allowedAggregations,
        });
      }
    }
    for (const f of includedBlendedFields) {
      if (!f.type) continue;
      if (!availableSourceByPath.get(f.aliasPath)?.isAccessibleForReporting) continue;
      cols.push({
        name: f.name,
        type: f.type,
        label: fieldDisplayLabel(f.alias, f.originalFieldName),
        dataMartName: f.outputPrefix.trim() || f.sourceDataMartTitle,
        path: [...f.aliasPath.split('.'), f.originalFieldName],
        aggregationRole: f.aggregationRole,
        allowedAggregations: f.allowedAggregations,
        postJoinAggregations: f.postJoinAggregations,
      });
    }
    return cols;
  }, [nativeFields, includedBlendedFields, availableSourceByPath]);

  const selectedDropdownColumns = useMemo(
    () => dropdownColumns.filter(c => effectiveValueSet.has(c.name)),
    [dropdownColumns, effectiveValueSet]
  );

  const controlsCount = useMemo(() => {
    return (
      effectiveOutputConfig.filterConfig.length +
      effectiveOutputConfig.sortConfig.length +
      (effectiveOutputConfig.limitConfig != null ? 1 : 0)
    );
  }, [effectiveOutputConfig]);

  // Badge = aggregation rules + date-trunc rules. Row Count is automatic for
  // aggregated reports and no longer has an opt-in toggle.
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

    return effectiveOutputConfig.sortConfig.some(
      rule => !effectiveValueSet.has(rule.column) || !knownFieldNames.has(rule.column)
    );
  }, [
    effectiveOutputConfig.filterConfig,
    effectiveOutputConfig.sortConfig,
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

  const groupedBlendedFields = useMemo<BlendedGroup[]>(() => {
    const groupMap = new Map<string, BlendedGroup>();

    for (const field of includedBlendedFields) {
      let group = groupMap.get(field.aliasPath);
      if (!group) {
        const source = availableSourceByPath.get(field.aliasPath);
        group = {
          aliasPath: field.aliasPath,
          title: field.sourceDataMartTitle,
          alias: field.outputPrefix,
          description: source?.description,
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

    return Array.from(groupMap.values()).filter(g => g.visibleFields.length > 0);
  }, [
    includedBlendedFields,
    showSelectedOnly,
    effectiveValueSet,
    availableSourceByPath,
    referencedFieldNames,
    referencedPreJoinKeys,
  ]);

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
    selectableFieldNames.length > 0 &&
    selectableFieldNames.every(name => effectiveValueSet.has(name));
  const toggleLabelClass =
    'text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-xs transition-colors';

  const showCapabilityFallback =
    !outputControlsSupported &&
    !!storageType &&
    !!outputConfig &&
    hasAnyOutputControls(outputConfig);

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between px-2'>
        <label className={toggleLabelClass}>
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
        <div className='flex items-center gap-3'>
          <label className={toggleLabelClass}>
            Show selected only
            <Switch checked={showSelectedOnly} onCheckedChange={setShowSelectedOnly} />
          </label>
          {outputControlsAvailable && (
            <AggregationSettingsButton
              active={hasAnyAggregation}
              count={aggregationCount}
              open={aggSettingsOpen}
              onClick={() => {
                setAggSettingsOpen(o => !o);
                setSettingsOpen(false);
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
                setSettingsOpen(o => !o);
                setAggSettingsOpen(false);
              }}
            />
          )}
        </div>
      </div>

      {settingsOpen && onOutputConfigChange && outputControlsSupported && (
        <div className='rounded-md border'>
          <OutputSettingsDropdown
            value={effectiveOutputConfig}
            onChange={onOutputConfigChange}
            selectedColumns={selectedDropdownColumns}
            allColumns={dropdownColumns}
            joinedSources={joinedSources}
          />
        </div>
      )}

      {aggSettingsOpen && onOutputConfigChange && outputControlsSupported && (
        <div className='rounded-md border'>
          <AggregationSettingsDropdown
            value={effectiveOutputConfig}
            onChange={onOutputConfigChange}
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
        {(unresolvedColumns.length > 0 ||
          unresolvedFilterOnlyColumns.length > 0 ||
          unresolvedSlices.length > 0) && (
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
              ...unresolvedColumns.map(name => ({ name, selected: true })),
              ...unresolvedFilterOnlyColumns.map(name => ({ name, selected: false })),
            ].map(({ name, selected }) => {
              const columnFilters = filtersByColumn.get(name) ?? EMPTY_COLUMN_FILTERS;
              return (
                <label
                  key={name}
                  className='group/row group hover:bg-destructive/20 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
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
            {unresolvedSlices.map(({ column, fieldType }) => {
              const slices = preJoinByAliasPathColumn.get(column) ?? EMPTY_COLUMN_FILTERS;
              return (
                <label
                  key={column}
                  className='group/row group hover:bg-destructive/20 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
                >
                  <Checkbox checked={false} disabled />
                  <span className='font-mono text-xs'>{column}</span>
                  {outputControlsAvailable && slices.rules.length > 0 && (
                    <RowFilterIcon
                      column={column}
                      fieldType={fieldType ?? 'STRING'}
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
        {visibleNativeFields.length === 0 && (
          <p className='text-muted-foreground px-1 text-xs'>No fields available.</p>
        )}
        {visibleNativeFields.map(field => (
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
          />
        ))}

        {hasPrimaryKey && outputControlsAvailable && (
          <label className='group hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1'>
            <Checkbox
              checked={effectiveOutputConfig.uniqueCountConfig}
              onCheckedChange={checked => {
                onOutputConfigChange?.({
                  ...effectiveOutputConfig,
                  uniqueCountConfig: checked === true,
                });
              }}
            />
            <span className='min-w-0 truncate text-xs'>Unique count</span>
            {effectiveOutputConfig.uniqueCountConfig && (
              <span className='ml-auto flex items-center'>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className='flex h-6 w-6 cursor-default items-center justify-center rounded text-blue-500'>
                      <Sigma className='h-4 w-4' />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-xs'>
                    Auto-generated column — counts the distinct values of the primary key.
                  </TooltipContent>
                </Tooltip>
                {/* Spacer matching the field rows' filter-icon slot so this Σ aligns with native rows. */}
                <span className='h-6 w-6' aria-hidden='true' />
              </span>
            )}
          </label>
        )}

        {groupedBlendedFields.map(group => (
          <BlendedGroupItem
            key={group.aliasPath}
            group={group}
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
          />
        ))}
      </div>

      {selectedNativeCount === 0 && (
        <p className='text-destructive text-xs'>At least one native field must be selected.</p>
      )}
    </div>
  );
}
