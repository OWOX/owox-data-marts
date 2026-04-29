import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@owox/ui/lib/utils';
import { Badge } from '@owox/ui/components/badge';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { Switch } from '@owox/ui/components/switch';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Skeleton } from '@owox/ui/components/skeleton';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/useBlendedFieldNames';
import type { BlendedField } from '../../../shared/types/relationship.types';
import { FieldInfoTooltip } from './FieldInfoTooltip';

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
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  onBlendedSelectionChange?: (hasBlendedSelection: boolean) => void;
  onCountChange?: (count: ReportColumnSelectionCount) => void;
}

type ToggleFieldFn = (name: string, checked: boolean) => void;

interface NativeFieldRowProps {
  field: NativeField;
  checked: boolean;
  onToggleField: ToggleFieldFn;
}

const NativeFieldRow = memo(function NativeFieldRow({
  field,
  checked,
  onToggleField,
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
    </label>
  );
});

interface BlendedFieldRowProps {
  field: BlendedField;
  checked: boolean;
  onToggleField: ToggleFieldFn;
}

const BlendedFieldRow = memo(function BlendedFieldRow({
  field,
  checked,
  onToggleField,
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
    </label>
  );
});

interface BlendedGroupItemProps {
  group: BlendedGroup;
  selectedSet: Set<string>;
  onToggleField: ToggleFieldFn;
}

function BlendedGroupItem({ group, selectedSet, onToggleField }: BlendedGroupItemProps) {
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
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ReportColumnPicker({
  dataMartId,
  value,
  onChange,
  onBlendedSelectionChange,
  onCountChange,
}: ReportColumnPickerProps) {
  const { data: schema, isLoading } = useQuery({
    queryKey: [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    queryFn: () => dataMartRelationshipService.getBlendableSchema(dataMartId),
    enabled: !!dataMartId,
  });

  const nativeFields = useMemo<NativeField[]>(
    () => (schema ? flattenNativeFields(schema.nativeFields as NativeField[]) : []),
    [schema]
  );

  // Only show blended fields from included sources
  const includedPaths = useMemo(() => {
    if (!schema?.availableSources) return new Set<string>();
    return new Set(schema.availableSources.filter(s => s.isIncluded).map(s => s.aliasPath));
  }, [schema]);

  const includedBlendedFields = useMemo(() => {
    if (!schema) return [];
    return schema.blendedFields.filter(f => includedPaths.has(f.aliasPath) && !f.isHidden);
  }, [schema, includedPaths]);

  // Legacy reports with columnConfig === null had the "all native fields, no blended"
  // meaning. Treat them the same for display/toggle math — the picker stays a pure
  // controlled component: it only calls onChange when the user actually toggles
  // something, so simply opening such a report does not mark the form dirty.
  const effectiveValue = useMemo<string[]>(() => {
    if (value !== null) return value;
    return nativeFields.map(f => f.name);
  }, [value, nativeFields]);

  const effectiveValueSet = useMemo(() => new Set(effectiveValue), [effectiveValue]);

  const includedBlendedNamesSet = useMemo(
    () => new Set(includedBlendedFields.map(f => f.name)),
    [includedBlendedFields]
  );

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

  const availableSourceDescriptionByPath = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const source of schema?.availableSources ?? []) {
      map.set(source.aliasPath, source.description);
    }
    return map;
  }, [schema]);

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
        <label className={toggleLabelClass}>
          Selected only
          <Switch checked={showSelectedOnly} onCheckedChange={setShowSelectedOnly} />
        </label>
      </div>

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
          />
        ))}

        {groupedBlendedFields.map(group => (
          <BlendedGroupItem
            key={group.aliasPath}
            group={group}
            selectedSet={effectiveValueSet}
            onToggleField={toggleField}
          />
        ))}
      </div>

      {selectedNativeCount === 0 && (
        <p className='text-destructive text-xs'>At least one native field must be selected.</p>
      )}
    </div>
  );
}
