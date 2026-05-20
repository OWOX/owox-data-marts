import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { Switch } from '@owox/ui/components/switch';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Skeleton } from '@owox/ui/components/skeleton';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/useBlendedFieldNames';
import type { BlendedField } from '../../../shared/types/relationship.types';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';
import {
  EMPTY_OUTPUT_CONFIG,
  hasAnyOutputControls,
  type FilterRule,
  type OutputConfig,
} from '../../../shared/types/output-config';
import { supportsOutputControls } from '../../../shared/utils/output-controls-support';
import { FieldInfoTooltip } from './FieldInfoTooltip';
import { OutputSettingsButton } from './OutputSettingsButton';
import { OutputSettingsDropdown } from './OutputSettingsDropdown';
import { RowFilterIcon } from './RowFilterIcon';
import { isFilterableType } from './output-controls-operators';

interface NativeField {
  name: string;
  type?: string;
  alias?: string;
  description?: string;
  fields?: NativeField[];
}

function flattenNativeFields(fields: NativeField[], prefix = ''): NativeField[] {
  const result: NativeField[] = [];
  for (const field of fields) {
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
  onBlendedSelectionChange?: (hasBlendedSelection: boolean) => void;
  onCountChange?: (count: ReportColumnSelectionCount) => void;
  onOrphanCountChange?: (count: number) => void;
}

type ToggleFieldFn = (name: string, checked: boolean) => void;
type AddFilterFn = (rule: FilterRule) => void;
type RemoveFilterAtFn = (globalIndex: number) => void;

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
}

const NativeFieldRow = memo(function NativeFieldRow({
  field,
  checked,
  onToggleField,
  filterableType,
  columnFilters,
  onAddFilter,
  onRemoveFilterAt,
}: NativeFieldRowProps) {
  return (
    <label className='group hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1'>
      <Checkbox
        checked={checked}
        onCheckedChange={c => {
          onToggleField(field.name, c === true);
        }}
      />
      <span className='font-mono text-xs'>{field.alias ?? field.name}</span>
      {field.type && <span className='text-muted-foreground text-xs'>({field.type})</span>}
      <FieldInfoTooltip text={field.description} compact />
      {filterableType && onAddFilter && onRemoveFilterAt && (
        <RowFilterIcon
          column={field.name}
          fieldType={filterableType}
          activeRules={columnFilters.rules}
          onAdd={onAddFilter}
          onRemoveAt={localIndex => {
            onRemoveFilterAt(columnFilters.indices[localIndex]);
          }}
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
}

const BlendedFieldRow = memo(function BlendedFieldRow({
  field,
  checked,
  onToggleField,
  filterableType,
  columnFilters,
  onAddFilter,
  onRemoveFilterAt,
}: BlendedFieldRowProps) {
  return (
    <label className='group hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1'>
      <Checkbox
        checked={checked}
        onCheckedChange={c => {
          onToggleField(field.name, c === true);
        }}
      />
      <span className='font-mono text-xs'>{field.alias || field.originalFieldName}</span>
      {field.type && <span className='text-muted-foreground text-xs'>({field.type})</span>}
      <FieldInfoTooltip text={field.description} compact />
      {filterableType && onAddFilter && onRemoveFilterAt && (
        <RowFilterIcon
          column={field.name}
          fieldType={filterableType}
          activeRules={columnFilters.rules}
          onAdd={onAddFilter}
          onRemoveAt={localIndex => {
            onRemoveFilterAt(columnFilters.indices[localIndex]);
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
}

function BlendedGroupItem({
  group,
  selectedSet,
  onToggleField,
  filterableTypeFor,
  filtersByColumn,
  onAddFilter,
  onRemoveFilterAt,
}: BlendedGroupItemProps) {
  const [isOpen, setIsOpen] = useState(() => group.selectedCount > 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <button
        type='button'
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group.alias}`}
        className='group bg-secondary/50 dark:bg-muted/50 hover:bg-secondary/80 dark:hover:bg-muted/80 flex w-full cursor-pointer items-start gap-1.5 rounded px-1 py-1 text-left transition-colors'
        onClick={() => {
          setIsOpen(v => !v);
        }}
      >
        {isOpen ? (
          <ChevronDown className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
        ) : (
          <ChevronRight className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
        )}
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <span className='truncate text-xs font-semibold' title={group.alias}>
              {group.alias}
            </span>
            <FieldInfoTooltip text={group.description} />
          </div>
        </div>
      </button>
      <CollapsibleContent>
        {group.visibleFields.map(field => (
          <BlendedFieldRow
            key={field.name}
            field={field}
            checked={selectedSet.has(field.name)}
            onToggleField={onToggleField}
            filterableType={filterableTypeFor?.(field.name)}
            columnFilters={filtersByColumn?.get(field.name) ?? EMPTY_COLUMN_FILTERS}
            onAddFilter={onAddFilter}
            onRemoveFilterAt={onRemoveFilterAt}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface OrphanFieldsSectionProps {
  orphanNames: string[];
  onRemove: (name: string) => void;
}

function OrphanFieldsSection({ orphanNames, onRemove }: OrphanFieldsSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <button
        type='button'
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} inaccessible columns`}
        className='group bg-destructive/10 hover:bg-destructive/15 flex w-full cursor-pointer items-start gap-1.5 rounded px-1 py-1 text-left transition-colors'
        onClick={() => {
          setIsOpen(v => !v);
        }}
      >
        {isOpen ? (
          <ChevronDown className='text-destructive mt-0.5 h-4 w-4 shrink-0' />
        ) : (
          <ChevronRight className='text-destructive mt-0.5 h-4 w-4 shrink-0' />
        )}
        <AlertTriangle className='text-destructive mt-0.5 h-4 w-4 shrink-0' />
        <span className='text-destructive text-xs font-semibold'>
          Inaccessible columns ({orphanNames.length})
        </span>
      </button>
      <CollapsibleContent>
        <p className='text-muted-foreground px-1 py-1 text-xs'>
          You no longer have access to the data marts these columns come from. Remove them before
          saving.
        </p>
        <div className='space-y-1'>
          {orphanNames.map(name => (
            <div key={name} className='flex items-center gap-2 rounded px-1 py-1'>
              <Checkbox checked disabled aria-label={name} />
              <span className='text-muted-foreground flex-1 truncate font-mono text-xs'>
                {name}
              </span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='text-destructive hover:text-destructive h-5 px-1 text-xs'
                onClick={() => {
                  onRemove(name);
                }}
                aria-label={`Remove ${name}`}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
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
  onBlendedSelectionChange,
  onCountChange,
  onOrphanCountChange,
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

  const orphanNames = useMemo<string[]>(() => {
    if (!schema) return [];
    const nativeNames = new Set(nativeFields.map(f => f.name));
    const allBlendedNames = new Set(schema.blendedFields.map(f => f.name));
    return effectiveValue.filter(n => !nativeNames.has(n) && !allBlendedNames.has(n));
  }, [schema, nativeFields, effectiveValue]);

  const hasBlendedSelection = useMemo(() => {
    if (!schema) return false;
    return effectiveValue.some(name => includedBlendedNamesSet.has(name));
  }, [schema, effectiveValue, includedBlendedNamesSet]);

  useEffect(() => {
    onBlendedSelectionChange?.(hasBlendedSelection);
  }, [hasBlendedSelection, onBlendedSelectionChange]);

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

  function selectAll() {
    if (!schema) return;
    const nativeNames = nativeFields.map(f => f.name);
    const blendedNames = includedBlendedFields.map(f => f.name);
    const known = new Set([...nativeNames, ...blendedNames]);
    const orphanSelections = effectiveValue.filter(name => !known.has(name));
    onChange([...nativeNames, ...blendedNames, ...orphanSelections]);
  }

  function deselectAll() {
    if (!schema) return;
    const known = new Set([
      ...nativeFields.map(f => f.name),
      ...includedBlendedFields.map(f => f.name),
    ]);
    onChange(effectiveValue.filter(name => !known.has(name)));
  }

  const selectedNativeCount = nativeFields.filter(f => effectiveValueSet.has(f.name)).length;

  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const visibleNativeFields = showSelectedOnly
    ? nativeFields.filter(f => effectiveValueSet.has(f.name))
    : nativeFields;

  const totalFieldsCount = nativeFields.length + includedBlendedFields.length;
  const selectedBlendedCount = effectiveValue.filter(name =>
    includedBlendedNamesSet.has(name)
  ).length;
  const selectedFieldsCount = selectedNativeCount + selectedBlendedCount;

  useEffect(() => {
    onCountChange?.({ selected: selectedFieldsCount, total: totalFieldsCount });
  }, [selectedFieldsCount, totalFieldsCount, onCountChange]);

  useEffect(() => {
    onOrphanCountChange?.(orphanNames.length);
  }, [orphanNames.length, onOrphanCountChange]);

  const availableSourceDescriptionByPath = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const source of schema?.availableSources ?? []) {
      map.set(source.aliasPath, source.description);
    }
    return map;
  }, [schema]);

  const filtersByColumn = useMemo<Map<string, ColumnFilters>>(() => {
    const map = new Map<string, ColumnFilters>();
    effectiveOutputConfig.filterConfig.forEach((rule, idx) => {
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

  const fieldTypeByName = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const f of nativeFields) {
      if (f.type) map.set(f.name, f.type);
    }
    for (const f of includedBlendedFields) {
      if (f.type) map.set(f.name, f.type);
    }
    return map;
  }, [nativeFields, includedBlendedFields]);

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

  const dropdownColumns = useMemo(() => {
    const cols: { name: string; type: string }[] = [];
    for (const f of nativeFields) {
      if (f.type) cols.push({ name: f.name, type: f.type });
    }
    for (const f of includedBlendedFields) {
      if (f.type) cols.push({ name: f.name, type: f.type });
    }
    return cols;
  }, [nativeFields, includedBlendedFields]);

  const selectedDropdownColumns = useMemo(
    () => dropdownColumns.filter(c => effectiveValueSet.has(c.name)),
    [dropdownColumns, effectiveValueSet]
  );

  const groupedBlendedFields = useMemo<BlendedGroup[]>(() => {
    const groupMap = new Map<string, BlendedGroup>();

    for (const field of includedBlendedFields) {
      let group = groupMap.get(field.aliasPath);
      if (!group) {
        group = {
          aliasPath: field.aliasPath,
          title: field.sourceDataMartTitle,
          alias: field.outputPrefix,
          description: availableSourceDescriptionByPath.get(field.aliasPath),
          visibleFields: [],
          selectedCount: 0,
        };
        groupMap.set(field.aliasPath, group);
      }
      const isSelected = effectiveValueSet.has(field.name);
      if (isSelected) group.selectedCount += 1;
      if (!showSelectedOnly || isSelected) group.visibleFields.push(field);
    }

    return Array.from(groupMap.values()).filter(g => g.visibleFields.length > 0);
  }, [
    includedBlendedFields,
    showSelectedOnly,
    effectiveValueSet,
    availableSourceDescriptionByPath,
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

  const allSelected = totalFieldsCount > 0 && selectedFieldsCount >= totalFieldsCount;
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
          />
        ))}

        {orphanNames.length > 0 && (
          <OrphanFieldsSection
            orphanNames={orphanNames}
            onRemove={name => {
              onChange(effectiveValue.filter(n => n !== name));
            }}
          />
        )}
      </div>

      {selectedNativeCount === 0 && (
        <p className='text-destructive text-xs'>At least one native field must be selected.</p>
      )}
    </div>
  );
}
