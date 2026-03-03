import { useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { Form, FormField, FormItem, FormControl } from '@owox/ui/components/form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@owox/ui/components/select';
import { Button } from '@owox/ui/components/button';
import { Plus, X } from 'lucide-react';
import type { FilterConfigItem, FilterOperator, FiltersState } from './types';
import { isFilterRowValid } from './filter-utils';
import { SelectValueControl, InputValueControl } from './index';

/* ---------------------------------------------------------------------------
 * Operator labels
 * ------------------------------------------------------------------------ */

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
};

/* ---------------------------------------------------------------------------
 * Internal form types
 * ------------------------------------------------------------------------ */

interface FilterItemFormValues {
  fieldId: string;
  operator: FilterOperator | '';
  value: string[];
}

interface FiltersFormValues {
  filters: FilterItemFormValues[];
}

/* ---------------------------------------------------------------------------
 * Ref API
 * ------------------------------------------------------------------------ */

export interface FiltersFormRef {
  getValues: () => FiltersState;
  reset: (state: FiltersState) => void;
}

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------ */

interface FiltersFormProps {
  config: FilterConfigItem[];
  defaultValues: FiltersState;
  onStateChange?: (state: FiltersState) => void;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

function toFormValues(state: FiltersState): FiltersFormValues {
  return {
    filters:
      state.filters.length > 0
        ? state.filters.map(f => ({
            fieldId: f.fieldId,
            operator: f.operator,
            value: f.value,
          }))
        : [{ fieldId: '', operator: '' as const, value: [] }],
  };
}

function toFiltersState(values: FiltersFormValues): FiltersState {
  return {
    version: 1,
    filters: values.filters
      .filter(f => isFilterRowValid(f))
      .map(f => ({
        fieldId: f.fieldId,
        operator: f.operator as FilterOperator,
        value: f.value,
      })),
  };
}

/* ---------------------------------------------------------------------------
 * ValueControl — single chips-based Combobox for all dataTypes
 * ------------------------------------------------------------------------ */

interface ValueControlProps {
  configItem: FilterConfigItem | undefined;
  value: string[];
  onChange: (v: string[]) => void;
  operator: FilterOperator | '';
}

function ValueControl(props: ValueControlProps) {
  const { operator } = props;

  const isInputOperator = operator === 'contains' || operator === 'not_contains';

  if (isInputOperator) {
    return <InputValueControl value={props.value} onChange={props.onChange} />;
  }

  return (
    <SelectValueControl
      configItem={props.configItem}
      value={props.value}
      onChange={props.onChange}
    />
  );
}

/* ---------------------------------------------------------------------------
 * Typed path helper
 * ------------------------------------------------------------------------ */

function filterPath<P extends string>(index: number, prop: P) {
  return `filters.${String(index)}.${prop}` as `filters.${number}.${P}`;
}

/* ---------------------------------------------------------------------------
 * Filter block (single row)
 * ------------------------------------------------------------------------ */

interface FilterBlockProps {
  index: number;
  config: FilterConfigItem[];
  usedFieldIds: Set<string>;
  control: ReturnType<typeof useForm<FiltersFormValues>>['control'];
  watch: ReturnType<typeof useForm<FiltersFormValues>>['watch'];
  setValue: ReturnType<typeof useForm<FiltersFormValues>>['setValue'];
  canRemove: boolean;
  onRemove: () => void;
}

function FilterBlock({
  index,
  config,
  usedFieldIds,
  control,
  watch,
  setValue,
  canRemove,
  onRemove,
}: FilterBlockProps) {
  const fieldPath = filterPath(index, 'fieldId');
  const opPath = filterPath(index, 'operator');
  const valPath = filterPath(index, 'value');

  const selectedFieldId = watch(fieldPath);
  const selectedOperator = watch(opPath);
  const configItem = config.find(c => c.id === selectedFieldId);
  const allowedOperators = configItem?.operators ?? [];

  // Fields available for this row: unselected fields + own current field
  const availableConfig = useMemo(
    () => config.filter(c => !usedFieldIds.has(c.id) || c.id === selectedFieldId),
    [config, usedFieldIds, selectedFieldId]
  );

  // Auto-set first operator when field changes
  useEffect(() => {
    if (!selectedFieldId) return;
    const currentOperator = watch(opPath);
    if (currentOperator) return;

    const firstOp = config.find(c => c.id === selectedFieldId)?.operators[0];
    if (firstOp) {
      setValue(opPath, firstOp, { shouldDirty: true, shouldTouch: true });
    }
  }, [selectedFieldId, config, opPath, setValue, watch]);

  // Clamp value array to 1 when operator changes to contains / not_contains
  useEffect(() => {
    if (selectedOperator !== 'contains' && selectedOperator !== 'not_contains') return;
    const current = watch(valPath);
    if (current.length > 1) {
      setValue(valPath, current.slice(0, 1), { shouldDirty: true });
    }
  }, [selectedOperator, valPath, watch, setValue]);

  return (
    <>
      {index > 0 && (
        <div className='text-muted-foreground/75 px-2 text-xs font-medium tracking-wider'>AND</div>
      )}

      <div className='relative'>
        {canRemove && (
          <button
            type='button'
            onClick={onRemove}
            className='text-muted-foreground dark:text-muted-foreground/75 hover:text-foreground dark:hover:text-foreground border-border/50 hover:border-border absolute top-[-8px] right-[-8px] rounded-sm border bg-white p-0.5 dark:bg-white/4 dark:hover:bg-white/16'
          >
            <X className='size-3.5' />
          </button>
        )}
        <div className='flex flex-wrap items-start gap-2 rounded-md border-b bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm dark:border-transparent dark:bg-white/4'>
          {/* Field selector */}
          <FormField
            control={control}
            name={fieldPath}
            render={({ field }) => (
              <FormItem variant='light' className='w-full md:w-40'>
                <FormControl>
                  <Select
                    value={field.value}
                    onValueChange={v => {
                      field.onChange(v);
                      setValue(valPath, []);
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Select field' />
                    </SelectTrigger>
                    <SelectContent>
                      {availableConfig.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />

          {/* Operator selector */}
          <FormField
            control={control}
            name={opPath}
            render={({ field }) => (
              <FormItem variant='light' className='w-full md:w-40'>
                <FormControl>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!selectedFieldId}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue
                        placeholder={!selectedFieldId ? 'Condition' : 'Select condition'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedOperators.map(op => (
                        <SelectItem key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />

          {/* Value input */}
          <FormField
            control={control}
            name={valPath}
            render={({ field }) => (
              <FormItem variant='light' className='flex-1'>
                <FormControl>
                  <ValueControl
                    configItem={configItem}
                    value={field.value}
                    onChange={field.onChange}
                    operator={selectedOperator}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

export const FiltersForm = forwardRef<FiltersFormRef, FiltersFormProps>(function FiltersForm(
  { config, defaultValues, onStateChange },
  ref
) {
  const form = useForm<FiltersFormValues>({
    defaultValues: toFormValues(defaultValues),
  });

  const { control, watch, setValue } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'filters',
  });

  useImperativeHandle(ref, () => ({
    getValues: () => toFiltersState(form.getValues()),
    reset: (state: FiltersState) => {
      form.reset(toFormValues(state));
    },
  }));

  // Report state changes to parent (for Apply button enable/disable)
  const watchedFilters = useWatch({ control, name: 'filters' });

  useEffect(() => {
    if (!onStateChange) return;
    onStateChange(toFiltersState(form.getValues()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFilters, onStateChange]);

  // Compute used field IDs across all rows for field exclusion
  const usedFieldIds = useMemo(
    () => new Set(watchedFilters.map(f => f.fieldId).filter(Boolean)),
    [watchedFilters]
  );

  const canAddMore = fields.length < config.length;

  return (
    <Form {...form}>
      <div className='flex flex-col gap-4 pb-2'>
        <div className='flex flex-col gap-2'>
          {fields.map((item, index) => (
            <FilterBlock
              key={item.id}
              index={index}
              config={config}
              usedFieldIds={usedFieldIds}
              control={control}
              watch={watch}
              setValue={setValue}
              canRemove={fields.length > 1}
              onRemove={() => {
                remove(index);
              }}
            />
          ))}

          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='self-start'
            disabled={!canAddMore}
            onClick={() => {
              append({ fieldId: '', operator: '' as FilterOperator, value: [] });
            }}
          >
            <Plus className='h-4 w-4' />
            New filter
          </Button>
        </div>
      </div>
    </Form>
  );
});
