import { useEffect, useRef, useState } from 'react';
import {
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from '@owox/ui/components/popover';
import { Button } from '@owox/ui/components/button';
import { AppForm, FormActions, FormLayout } from '@owox/ui/components/form';
import { useTableFilters } from './TableFilters';
import { FiltersForm, type FiltersFormRef } from './FiltersForm';
import { isFilterRowValid } from './filter-utils';
import { DEFAULT_FILTERS_STATE, type FiltersState } from './types';
import type { FilterConfigItem } from './types';

interface TableFiltersContentProps {
  config: FilterConfigItem[];
  title?: string;
  description?: string;
}

export function TableFiltersContent({
  config,
  title = 'Filters',
  description = 'Filter your table to narrow down your data',
}: TableFiltersContentProps) {
  const { open, setOpen, appliedState, onApply, onClear } = useTableFilters();

  const formRef = useRef<FiltersFormRef>(null);
  const didApplyRef = useRef(false);

  // Live form state reported by FiltersForm via onStateChange
  const [liveState, setLiveState] = useState<FiltersState>(appliedState);

  const hasValidFilter = liveState.filters.some(f =>
    isFilterRowValid({ fieldId: f.fieldId, operator: f.operator, value: f.value })
  );
  const isDifferent = JSON.stringify(liveState.filters) !== JSON.stringify(appliedState.filters);
  const canApply = hasValidFilter && isDifferent;

  useEffect(() => {
    if (!open) {
      if (didApplyRef.current) {
        didApplyRef.current = false;
      } else {
        formRef.current?.reset(appliedState);
        setLiveState(appliedState);
      }
    }
  }, [open, appliedState]);

  const handleApply = () => {
    didApplyRef.current = true;
    const state = formRef.current?.getValues();
    if (state) {
      onApply(state);
    }
    setOpen(false);
  };

  const handleClear = () => {
    didApplyRef.current = true;
    onClear();
    formRef.current?.reset(DEFAULT_FILTERS_STATE);
    setLiveState(DEFAULT_FILTERS_STATE);
    setOpen(false);
  };

  return (
    <PopoverContent variant='light' align='start' className='bg-background'>
      <PopoverHeader>
        <PopoverTitle>{title}</PopoverTitle>
        <PopoverDescription>{description}</PopoverDescription>
      </PopoverHeader>

      <AppForm>
        <FormLayout className='max-h-[40vh]'>
          <FiltersForm
            ref={formRef}
            config={config}
            defaultValues={appliedState}
            onStateChange={setLiveState}
          />
        </FormLayout>

        <FormActions variant='inline'>
          <Button variant='outline' size='sm' type='button' onClick={handleClear}>
            Clear all
          </Button>

          <Button size='sm' type='button' disabled={!canApply} onClick={handleApply}>
            Apply filters
          </Button>
        </FormActions>
      </AppForm>
    </PopoverContent>
  );
}
