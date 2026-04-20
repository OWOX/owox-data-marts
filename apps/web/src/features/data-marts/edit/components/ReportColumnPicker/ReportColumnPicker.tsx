import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@owox/ui/lib/utils';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
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
  totalCount: number;
}

export interface ReportColumnPickerProps {
  dataMartId: string;
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  onBlendedSelectionChange?: (hasBlendedSelection: boolean) => void;
}

interface NativeFieldsGroupProps {
  nativeFields: NativeField[];
  description?: string;
  selectedCount: number;
  totalCount: number;
  isChecked: (name: string) => boolean;
  onToggleField: (name: string, checked: boolean) => void;
}

function NativeFieldsGroup({
  nativeFields,
  description,
  selectedCount,
  totalCount,
  isChecked,
  onToggleField,
}: NativeFieldsGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  const counterText = `${selectedCount} / ${totalCount}`;
  const fieldWord = totalCount === 1 ? 'field' : 'fields';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <button
        type='button'
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} Default Data Mart Columns`}
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
          <div className='flex items-center justify-between gap-1.5'>
            <div className='flex min-w-0 items-center gap-1.5'>
              <span className='truncate text-xs font-semibold'>Default Data Mart Columns</span>
              <FieldInfoTooltip text={description} />
            </div>
            <span className='text-muted-foreground shrink-0 text-xs'>
              {counterText} {fieldWord}
            </span>
          </div>
        </div>
      </button>
      <CollapsibleContent>
        {nativeFields.length === 0 && (
          <p className='text-muted-foreground px-1 text-xs'>No fields available.</p>
        )}
        {nativeFields.map(field => (
          <label
            key={field.name}
            className='group hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
          >
            <Checkbox
              checked={isChecked(field.name)}
              onCheckedChange={checked => {
                onToggleField(field.name, checked === true);
              }}
            />
            <span className='font-mono text-xs'>{field.alias ?? field.name}</span>
            {field.type && <span className='text-muted-foreground text-xs'>({field.type})</span>}
            <FieldInfoTooltip text={field.description} compact />
          </label>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface BlendedGroupItemProps {
  group: BlendedGroup;
  isChecked: (name: string) => boolean;
  onToggleField: (name: string, checked: boolean) => void;
}

function BlendedGroupItem({ group, isChecked, onToggleField }: BlendedGroupItemProps) {
  const [isOpen, setIsOpen] = useState(() => group.selectedCount > 0);

  const counterText = `${group.selectedCount} / ${group.totalCount}`;
  const fieldWord = group.totalCount === 1 ? 'field' : 'fields';

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
          <div className='flex items-center justify-between gap-1.5'>
            <div className='flex min-w-0 items-center gap-1.5'>
              <span className='truncate text-xs font-semibold' title={group.alias}>
                {group.alias}
              </span>
              <FieldInfoTooltip text={group.description} />
            </div>
            <span className='text-muted-foreground shrink-0 text-xs'>
              {counterText} {fieldWord}
            </span>
          </div>
        </div>
      </button>
      <CollapsibleContent>
        {group.visibleFields.map(field => (
          <label
            key={field.name}
            className='group hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
          >
            <Checkbox
              checked={isChecked(field.name)}
              onCheckedChange={checked => {
                onToggleField(field.name, checked === true);
              }}
            />
            <span className='font-mono text-xs'>{field.alias || field.originalFieldName}</span>
            {field.type && <span className='text-muted-foreground text-xs'>({field.type})</span>}
            <FieldInfoTooltip text={field.description} compact />
          </label>
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

  const hasBlendedSelection = useMemo(() => {
    if (!schema) return false;
    const blendedNames = new Set(includedBlendedFields.map(f => f.name));
    return effectiveValue.some(name => blendedNames.has(name));
  }, [schema, effectiveValue, includedBlendedFields]);

  useEffect(() => {
    onBlendedSelectionChange?.(hasBlendedSelection);
  }, [hasBlendedSelection, onBlendedSelectionChange]);

  function isChecked(fieldName: string): boolean {
    return effectiveValue.includes(fieldName);
  }

  function toggleField(fieldName: string, checked: boolean) {
    if (checked) {
      if (effectiveValue.includes(fieldName)) return;
      onChange([...effectiveValue, fieldName]);
    } else {
      onChange(effectiveValue.filter(name => name !== fieldName));
    }
  }

  function selectAllNative() {
    if (!schema) return;
    const nativeNames = nativeFields.map(f => f.name);
    const currentBlended = effectiveValue.filter(name => !nativeNames.includes(name));
    onChange([...nativeNames, ...currentBlended]);
  }

  function deselectAllNative() {
    if (!schema) return;
    const nativeNames = new Set(nativeFields.map(f => f.name));
    onChange(effectiveValue.filter(name => !nativeNames.has(name)));
  }

  const selectedNativeCount = nativeFields.filter(f => isChecked(f.name)).length;

  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const visibleNativeFields = showSelectedOnly
    ? nativeFields.filter(f => isChecked(f.name))
    : nativeFields;

  const availableSourceDescriptionByPath = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const source of schema?.availableSources ?? []) {
      map.set(source.aliasPath, source.description);
    }
    return map;
  }, [schema]);

  const groupedBlendedFields = useMemo<BlendedGroup[]>(() => {
    const selectedSet = new Set(effectiveValue);
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
          totalCount: 0,
        };
        groupMap.set(field.aliasPath, group);
      }
      group.totalCount += 1;
      const isSelected = selectedSet.has(field.name);
      if (isSelected) group.selectedCount += 1;
      if (!showSelectedOnly || isSelected) group.visibleFields.push(field);
    }

    // У режимі "Selected only" ховаємо групи, у яких немає жодного видимого поля
    return Array.from(groupMap.values()).filter(g => g.visibleFields.length > 0);
  }, [includedBlendedFields, showSelectedOnly, effectiveValue, availableSourceDescriptionByPath]);

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

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <label className='text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-xs transition-colors'>
          <Checkbox
            checked={showSelectedOnly}
            onCheckedChange={checked => {
              setShowSelectedOnly(checked === true);
            }}
          />
          Selected only
        </label>
        <div className='flex gap-2'>
          <button
            type='button'
            className='text-muted-foreground hover:text-foreground cursor-pointer text-xs transition-colors'
            onClick={selectAllNative}
          >
            Select All
          </button>
          <span className='text-muted-foreground text-xs'>/</span>
          <button
            type='button'
            className='text-muted-foreground hover:text-foreground cursor-pointer text-xs transition-colors'
            onClick={deselectAllNative}
          >
            Deselect All
          </button>
        </div>
      </div>

      <div
        className={cn(
          'max-h-[32rem] space-y-1 overflow-y-auto rounded-md border p-1',
          selectedNativeCount === 0 ? 'border-destructive' : 'border-border'
        )}
      >
        {/* Default Columns (native fields) */}
        <NativeFieldsGroup
          nativeFields={visibleNativeFields}
          description={schema?.nativeDescription}
          selectedCount={selectedNativeCount}
          totalCount={nativeFields.length}
          isChecked={isChecked}
          onToggleField={toggleField}
        />

        {/* Blended field groups */}
        {groupedBlendedFields.map(group => (
          <BlendedGroupItem
            key={group.aliasPath}
            group={group}
            isChecked={isChecked}
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
