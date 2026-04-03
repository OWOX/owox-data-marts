import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Skeleton } from '@owox/ui/components/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
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

export interface ReportColumnPickerProps {
  dataMartId: string;
  value: string[] | null;
  onChange: (value: string[] | null) => void;
}

const BLENDABLE_SCHEMA_QUERY_KEY = 'blendable-schema';

/**
 * Column picker for report configuration.
 * Allows selecting which columns to export: all native (default) or a custom subset.
 */
export function ReportColumnPicker({ dataMartId, value, onChange }: ReportColumnPickerProps) {
  const mode: ColumnMode = value === null ? 'default' : 'custom';

  const { data: schema, isLoading } = useQuery({
    queryKey: [BLENDABLE_SCHEMA_QUERY_KEY, dataMartId],
    queryFn: () => dataMartRelationshipService.getBlendableSchema(dataMartId),
    enabled: !!dataMartId,
  });

  function handleModeChange(newMode: ColumnMode) {
    if (newMode === 'default') {
      onChange(null);
    } else {
      // Start with all native fields selected
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
    const blendedNames = schema.blendedFields.map(f => f.name);
    const currentNative = (value ?? []).filter(name => !blendedNames.includes(name));
    onChange([...currentNative, ...blendedNames]);
  }

  function deselectAllBlended() {
    if (!schema) return;
    const blendedNames = new Set(schema.blendedFields.map(f => f.name));
    onChange((value ?? []).filter(name => !blendedNames.has(name)));
  }

  const nativeFields: NativeField[] =
    mode === 'custom' && schema ? flattenNativeFields(schema.nativeFields as NativeField[]) : [];

  const blendedFields: BlendedField[] = mode === 'custom' && schema ? schema.blendedFields : [];

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

      {mode === 'default' && (
        <p className='text-muted-foreground text-sm'>
          All native columns will be exported. No blended columns.
        </p>
      )}

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
          {/* Native Fields group */}
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>Native Fields</span>
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

            <div className='max-h-48 space-y-1 overflow-y-auto'>
              {nativeFields.map(field => (
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
          </div>

          {/* Blendable Fields group */}
          {blendedFields.length > 0 && (
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>Blendable Fields</span>
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

              <div className='max-h-48 space-y-1 overflow-y-auto'>
                {blendedFields.map(field => (
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
                    <span className='font-mono text-xs'>{field.name}</span>
                    {field.type && (
                      <span className='text-muted-foreground text-xs'>({field.type})</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
