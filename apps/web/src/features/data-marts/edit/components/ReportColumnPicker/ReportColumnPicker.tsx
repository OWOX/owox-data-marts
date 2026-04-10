import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@owox/ui/lib/utils';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Collapsible, CollapsibleContent } from '@owox/ui/components/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Skeleton } from '@owox/ui/components/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/useBlendedFieldNames';
import type { BlendedField } from '../../../shared/types/relationship.types';

type ColumnMode = 'default' | 'custom';

interface NativeField {
  name: string;
  type?: string;
  alias?: string;
  fields?: NativeField[];
}

function flattenNativeFields(fields: NativeField[], prefix = ''): NativeField[] {
  const result: NativeField[] = [];
  for (const field of fields) {
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({ name: fullName, type: field.type, alias: field.alias });
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
  fields: BlendedField[];
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

interface BlendedGroupItemProps {
  group: BlendedGroup;
  isChecked: (name: string) => boolean;
  onToggleField: (name: string, checked: boolean) => void;
}

function BlendedGroupItem({ group, isChecked, onToggleField }: BlendedGroupItemProps) {
  // Smart default: групи з уже вибраними полями стартують відкритими
  const [isOpen, setIsOpen] = useState(() => group.selectedCount > 0);

  const counterText =
    group.selectedCount > 0
      ? `${group.selectedCount} / ${group.totalCount}`
      : `${group.totalCount}`;
  const fieldWord = group.totalCount === 1 ? 'field' : 'fields';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <button
        type='button'
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${group.title}`}
        className='bg-secondary/50 dark:bg-muted/50 hover:bg-secondary/80 dark:hover:bg-muted/80 flex w-full cursor-pointer items-start gap-1.5 rounded px-1 py-1 text-left transition-colors'
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
          <div className='truncate text-xs font-semibold' title={group.title}>
            {group.title}
          </div>
          <div className='flex items-center gap-1'>
            <span className='text-muted-foreground shrink-0 text-xs'>
              {counterText} {fieldWord}
            </span>
            <span className='text-muted-foreground shrink-0 text-xs'>·</span>
            <span className='text-muted-foreground truncate font-mono text-xs' title={group.alias}>
              {group.alias}
            </span>
          </div>
        </div>
      </button>
      <CollapsibleContent>
        {group.visibleFields.map(field => (
          <label
            key={field.name}
            className='hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
          >
            <Checkbox
              checked={isChecked(field.name)}
              onCheckedChange={checked => {
                onToggleField(field.name, checked === true);
              }}
            />
            <span className='font-mono text-xs'>{field.alias || field.name}</span>
            {field.type && <span className='text-muted-foreground text-xs'>({field.type})</span>}
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
  const mode: ColumnMode = value === null ? 'default' : 'custom';

  const { data: schema, isLoading } = useQuery({
    queryKey: [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    queryFn: () => dataMartRelationshipService.getBlendableSchema(dataMartId),
    enabled: !!dataMartId,
  });

  // Only show blended fields from included sources
  const includedPaths = useMemo(() => {
    if (!schema?.availableSources) return new Set<string>();
    return new Set(schema.availableSources.filter(s => s.isIncluded).map(s => s.aliasPath));
  }, [schema]);

  const includedBlendedFields = useMemo(() => {
    if (!schema) return [];
    return schema.blendedFields.filter(f => includedPaths.has(f.aliasPath) && !f.isHidden);
  }, [schema, includedPaths]);

  const hasBlendedSelection = useMemo(() => {
    if (!schema || value === null) return false;
    const blendedNames = new Set(includedBlendedFields.map(f => f.name));
    return value.some(name => blendedNames.has(name));
  }, [schema, value, includedBlendedFields]);

  useEffect(() => {
    onBlendedSelectionChange?.(hasBlendedSelection);
  }, [hasBlendedSelection, onBlendedSelectionChange]);

  function handleModeChange(newMode: ColumnMode) {
    if (newMode === 'default') {
      onChange(null);
    } else {
      const nativeFields = flattenNativeFields((schema?.nativeFields ?? []) as NativeField[]);
      onChange(nativeFields.map(f => f.name));
    }
  }

  function isChecked(fieldName: string): boolean {
    return value?.includes(fieldName) ?? false;
  }

  function toggleField(fieldName: string, checked: boolean) {
    if (value === null) return;
    if (checked) {
      onChange([...value, fieldName]);
    } else {
      onChange(value.filter(name => name !== fieldName));
    }
  }

  function selectAllNative() {
    if (!schema) return;
    const nativeNames = flattenNativeFields(schema.nativeFields as NativeField[]).map(f => f.name);
    const currentBlended = (value ?? []).filter(name => !nativeNames.includes(name));
    onChange([...nativeNames, ...currentBlended]);
  }

  function deselectAllNative() {
    if (!schema) return;
    const nativeNames = new Set(
      flattenNativeFields(schema.nativeFields as NativeField[]).map(f => f.name)
    );
    onChange((value ?? []).filter(name => !nativeNames.has(name)));
  }

  function selectAllBlended() {
    if (!schema) return;
    const blendedNames = includedBlendedFields.map(f => f.name);
    const currentNative = (value ?? []).filter(name => !blendedNames.includes(name));
    onChange([...currentNative, ...blendedNames]);
  }

  function deselectAllBlended() {
    if (!schema) return;
    const blendedNames = new Set(includedBlendedFields.map(f => f.name));
    onChange((value ?? []).filter(name => !blendedNames.has(name)));
  }

  const nativeFields: NativeField[] =
    mode === 'custom' && schema ? flattenNativeFields(schema.nativeFields as NativeField[]) : [];

  const blendedFields = useMemo<BlendedField[]>(
    () => (mode === 'custom' ? includedBlendedFields : []),
    [mode, includedBlendedFields]
  );

  const selectedNativeCount = nativeFields.filter(f => isChecked(f.name)).length;
  const selectedBlendedCount = blendedFields.filter(f => isChecked(f.name)).length;

  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const visibleNativeFields = showSelectedOnly
    ? nativeFields.filter(f => isChecked(f.name))
    : nativeFields;

  const groupedBlendedFields = useMemo<BlendedGroup[]>(() => {
    const selectedSet = new Set(value ?? []);
    const groupMap = new Map<string, BlendedGroup>();

    for (const field of blendedFields) {
      let group = groupMap.get(field.aliasPath);
      if (!group) {
        group = {
          aliasPath: field.aliasPath,
          title: field.sourceDataMartTitle,
          alias: field.outputPrefix,
          fields: [],
          visibleFields: [],
          selectedCount: 0,
          totalCount: 0,
        };
        groupMap.set(field.aliasPath, group);
      }
      group.fields.push(field);
      group.totalCount += 1;
      const isSelected = selectedSet.has(field.name);
      if (isSelected) group.selectedCount += 1;
      if (!showSelectedOnly || isSelected) group.visibleFields.push(field);
    }

    // У режимі "Selected only" ховаємо групи, у яких немає жодного видимого поля
    return Array.from(groupMap.values()).filter(g => g.visibleFields.length > 0);
  }, [blendedFields, showSelectedOnly, value]);

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-3'>
        <Select
          value={mode}
          onValueChange={v => {
            handleModeChange(v as ColumnMode);
          }}
        >
          <SelectTrigger className='bg-background w-56'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='default'>Default (all native)</SelectItem>
            <SelectItem value='custom'>Custom</SelectItem>
          </SelectContent>
        </Select>

        {mode === 'default' && (
          <span className='text-muted-foreground text-sm'>
            All native columns will be exported.
          </span>
        )}

        {mode === 'custom' && value !== null && (
          <button
            type='button'
            className='text-muted-foreground hover:text-foreground text-sm underline transition-colors'
            onClick={() => {
              onChange(null);
            }}
          >
            Reset to Default
          </button>
        )}
      </div>

      {mode === 'custom' && isLoading && (
        <div className='space-y-2'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-6 w-full' />
          <Skeleton className='h-6 w-full' />
          <Skeleton className='h-6 w-full' />
        </div>
      )}

      {mode === 'custom' && !isLoading && (
        <div className='space-y-4'>
          <label className='text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-xs transition-colors'>
            <Checkbox
              checked={showSelectedOnly}
              onCheckedChange={checked => {
                setShowSelectedOnly(checked === true);
              }}
            />
            Selected only
          </label>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>
                Native Fields{' '}
                <span className='text-muted-foreground font-normal'>
                  ({selectedNativeCount}/{nativeFields.length})
                </span>
              </span>
              <div className='flex gap-2'>
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                  onClick={selectAllNative}
                >
                  Select All
                </button>
                <span className='text-muted-foreground text-xs'>/</span>
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                  onClick={deselectAllNative}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {nativeFields.length === 0 && (
              <p className='text-muted-foreground text-xs'>No native fields available.</p>
            )}

            <div
              className={cn(
                'max-h-48 space-y-1 overflow-y-auto rounded-md border p-1',
                selectedNativeCount === 0 ? 'border-destructive' : 'border-border'
              )}
            >
              {visibleNativeFields.map(field => (
                <label
                  key={field.name}
                  className='hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1'
                >
                  <Checkbox
                    checked={isChecked(field.name)}
                    onCheckedChange={checked => {
                      toggleField(field.name, checked === true);
                    }}
                  />
                  <span className='font-mono text-xs'>{field.alias ?? field.name}</span>
                  {field.type && (
                    <span className='text-muted-foreground text-xs'>({field.type})</span>
                  )}
                </label>
              ))}
            </div>
            {selectedNativeCount === 0 && (
              <p className='text-destructive text-xs'>
                At least one native field must be selected.
              </p>
            )}
          </div>

          {blendedFields.length > 0 && (!showSelectedOnly || selectedBlendedCount > 0) && (
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>
                  Blendable Fields{' '}
                  <span className='text-muted-foreground font-normal'>
                    ({selectedBlendedCount}/{blendedFields.length})
                  </span>
                </span>
                <div className='flex gap-2'>
                  <button
                    type='button'
                    className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                    onClick={selectAllBlended}
                  >
                    Select All
                  </button>
                  <span className='text-muted-foreground text-xs'>/</span>
                  <button
                    type='button'
                    className='text-muted-foreground hover:text-foreground text-xs transition-colors'
                    onClick={deselectAllBlended}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className='border-border max-h-96 space-y-1 overflow-y-auto rounded-md border p-1'>
                {groupedBlendedFields.map(group => (
                  <BlendedGroupItem
                    key={group.aliasPath}
                    group={group}
                    isChecked={isChecked}
                    onToggleField={toggleField}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
