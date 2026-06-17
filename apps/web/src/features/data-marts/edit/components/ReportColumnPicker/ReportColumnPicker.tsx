import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { AlertTriangle, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@owox/ui/components/skeleton';
import { NoAccessIndicator } from '../DataMartRelationships/NoAccessIndicator';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';
import type { AvailableSource, BlendedField } from '../../../shared/types/relationship.types';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import {
  EMPTY_OUTPUT_CONFIG,
  hasAnyOutputControls,
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
import { fieldDisplayLabel } from './output-controls-display';
import { makePreJoinKey } from './output-controls-utils';
import { RowFilterIcon } from './RowFilterIcon';
import { isFilterableType } from './output-controls-operators';

interface NativeField {
  name: string;
  type?: string;
  alias?: string;
  description?: string;
  isHiddenForReporting?: boolean;
  status?: string;
  fields?: NativeField[];
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

interface ColumnFilters {
  rules: FilterRule[];
  indices: number[];
}

const EMPTY_COLUMN_FILTERS: ColumnFilters = { rules: [], indices: [] };

interface NativeFieldRowProps {
  field: NativeField;
  checked: boolean;
  onToggleField: ToggleFieldFn;
  filterableType?: string;
  columnFilters: ColumnFilters;
  onAddFilter?: AddFilterFn;
  onRemoveFilterAt?: RemoveFilterAtFn;
  onReplaceFilterAt?: ReplaceFilterAtFn;
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
}: NativeFieldRowProps) {
  return (
    <label className='group hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1'>
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
      {filterableType && onAddFilter && onRemoveFilterAt && (
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
      )}
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
  hoverClassName = 'hover:bg-muted/50',
  removeOnly = false,
}: BlendedFieldRowProps) {
  const effectiveAddFilter = removeOnly ? undefined : onAddFilter;
  const effectiveReplaceFilter = removeOnly ? undefined : onReplaceFilterAt;
  return (
    <label
      className={cn(
        'group flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1',
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
      {filterableType &&
        onRemoveFilterAt &&
        (effectiveAddFilter !== undefined ||
          columnFilters.rules.length > 0 ||
          preJoinSlices.rules.length > 0) && (
          <RowFilterIcon
            column={field.name}
            fieldType={filterableType}
            displayLabel={fieldDisplayLabel(field.alias, field.originalFieldName)}
            dataMartName={field.outputPrefix.trim() || field.sourceDataMartTitle}
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
              aliasPath: field.aliasPath,
              originalFieldName: field.originalFieldName,
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
        )}
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
          const sliceKey = makePreJoinKey(field.aliasPath, field.originalFieldName);
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
              preJoinSlices={preJoinByAliasPathColumn?.get(sliceKey) ?? EMPTY_COLUMN_FILTERS}
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
  const { data: schema, isLoading } = useQuery({
    queryKey: [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    queryFn: () => dataMartRelationshipService.getBlendableSchema(dataMartId),
    enabled: !!dataMartId,
  });

  const nativeFields = useMemo<NativeField[]>(
    () => (schema ? flattenNativeFields(schema.nativeFields as NativeField[]) : []),
    [schema]
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
      if (!f.isHidden) keys.add(makePreJoinKey(f.aliasPath, f.originalFieldName));
    }
    return keys;
  }, [schema]);

  const unresolvedSlices = useMemo(() => {
    if (!schema) return [];
    const typeByKey = new Map<string, string>();
    for (const f of schema.blendedFields) {
      const key = makePreJoinKey(f.aliasPath, f.originalFieldName);
      if (f.type) typeByKey.set(key, f.type);
    }
    const seen = new Set<string>();
    const result: { aliasPath: string; column: string; fieldType?: string }[] = [];
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement !== 'pre-join' || !rule.aliasPath) continue;
      const key = makePreJoinKey(rule.aliasPath, rule.column);
      if (knownSliceKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      result.push({
        aliasPath: rule.aliasPath,
        column: rule.column,
        fieldType: typeByKey.get(key),
      });
    }
    return result;
  }, [schema, effectiveOutputConfig.filterConfig, knownSliceKeys]);

  const valueRef = useRef(effectiveValue);
  valueRef.current = effectiveValue;

  const toggleField = useCallback<ToggleFieldFn>(
    (fieldName, checked) => {
      const current = valueRef.current;
      if (checked) {
        if (current.includes(fieldName)) return;
        onChange([...current, fieldName]);
      } else {
        onChange(current.filter(name => name !== fieldName));
      }
    },
    [onChange]
  );

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

  // Pre-join filters (slices) keyed by aliasPath + raw column.
  const preJoinByAliasPathColumn = useMemo<Map<string, ColumnFilters>>(() => {
    const map = new Map<string, ColumnFilters>();
    effectiveOutputConfig.filterConfig.forEach((rule, idx) => {
      if (rule.placement !== 'pre-join' || !rule.aliasPath) return;
      const key = makePreJoinKey(rule.aliasPath, rule.column);
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
      entry.columns.push({ name: field.originalFieldName, type: field.type, alias: field.alias });
    }
    for (const entry of byPath.values()) {
      const seen = new Set<string>();
      entry.columns = entry.columns.filter(c => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
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

  const hasDisconnectedOutputControls = useMemo(() => {
    for (const rule of effectiveOutputConfig.filterConfig) {
      if (rule.placement === 'pre-join') {
        if (!rule.aliasPath || !knownSliceKeys.has(makePreJoinKey(rule.aliasPath, rule.column))) {
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
      if (rule.placement === 'pre-join' && rule.aliasPath) {
        keys.add(makePreJoinKey(rule.aliasPath, rule.column));
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
        isSelected ||
        referencedFieldNames.has(field.name) ||
        referencedPreJoinKeys.has(makePreJoinKey(field.aliasPath, field.originalFieldName));
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
            <OutputSettingsButton
              active={hasAnyOutputControls(effectiveOutputConfig)}
              count={controlsCount}
              hasDisconnectedControls={hasDisconnectedOutputControls}
              open={settingsOpen}
              onClick={() => {
                setSettingsOpen(o => !o);
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
                  className='group hover:bg-destructive/20 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
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
            {unresolvedSlices.map(({ aliasPath, column, fieldType }) => {
              const sliceKey = makePreJoinKey(aliasPath, column);
              const slices = preJoinByAliasPathColumn.get(sliceKey) ?? EMPTY_COLUMN_FILTERS;
              return (
                <label
                  key={sliceKey}
                  className='group hover:bg-destructive/20 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
                >
                  <Checkbox checked={false} disabled />
                  <span className='font-mono text-xs'>{`${aliasPath}.${column}`}</span>
                  {outputControlsAvailable && slices.rules.length > 0 && (
                    <RowFilterIcon
                      column={column}
                      fieldType={fieldType ?? 'STRING'}
                      activeRules={EMPTY_COLUMN_FILTERS.rules}
                      onRemoveAt={() => undefined}
                      sliceIconProps={{
                        aliasPath,
                        originalFieldName: column,
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
          />
        ))}

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
          />
        ))}
      </div>

      {selectedNativeCount === 0 && (
        <p className='text-destructive text-xs'>At least one native field must be selected.</p>
      )}
    </div>
  );
}
