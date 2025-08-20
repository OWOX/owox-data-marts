import { forwardRef, useEffect } from 'react';

import {
  type DataMartReport,
  isLookerStudioDestinationConfig,
} from '../../../shared/model/types/data-mart-report.ts';
import { useLookerStudioReportForm } from '../../hooks/useLookerStudioReportForm.ts';
import {
  Form,
  AppForm,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormLayout,
  FormActions,
  FormSection,
  FormDescription,
} from '@owox/ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types.ts';
import { type DataDestination } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';
import { Button } from '@owox/ui/components/button';
import LookerStudioCacheLifetimeDescription from './LookerStudioCacheLifetimeDescription.tsx';

interface LookerStudioReportEditFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  onDirtyChange?: (isDirty: boolean) => void;
  formError?: string | null;
  onFormErrorChange?: (error: string | null) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  preSelectedDestination?: DataDestination | null;
}

// Cache time options in seconds
const CACHE_TIME_OPTIONS = [
  // Minutes
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  // Hours
  { value: 3600, label: '1 hour' },
  { value: 7200, label: '2 hours' },
  { value: 14400, label: '4 hours' },
  { value: 28800, label: '8 hours' },
  { value: 43200, label: '12 hours' },
];

export const LookerStudioReportEditForm = forwardRef<
  HTMLFormElement,
  LookerStudioReportEditFormProps
>(
  (
    {
      initialReport,
      mode = ReportFormMode.EDIT,
      onDirtyChange,
      onFormErrorChange,
      onSubmit,
      onCancel,
      preSelectedDestination,
    },
    ref
  ) => {
    const formId = 'looker-studio-edit-form';

    const { dataMart } = useOutletContext<DataMartContextType>();

    const {
      isDirty,
      reset,
      form,
      isSubmitting,
      formError: internalFormError,
      onSubmit: handleFormSubmit,
    } = useLookerStudioReportForm({
      initialReport,
      dataMartId: dataMart?.id ?? '',
      onSuccess: () => {
        onSubmit?.();
      },
      preSelectedDestination,
    });

    useEffect(() => {
      if (onFormErrorChange) {
        onFormErrorChange(internalFormError);
      }
    }, [internalFormError, onFormErrorChange]);

    useEffect(() => {
      if (
        mode === ReportFormMode.EDIT &&
        initialReport &&
        isLookerStudioDestinationConfig(initialReport.destinationConfig)
      ) {
        reset({
          cacheLifetime: initialReport.destinationConfig.cacheLifetime,
        });
      } else if (mode === ReportFormMode.CREATE) {
        // Pre-select destination if provided
        reset({ cacheLifetime: 300 });
      }
    }, [initialReport, mode, reset]);

    useEffect(() => {
      onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    return (
      <Form {...form}>
        <AppForm
          id={formId}
          ref={ref}
          noValidate
          onSubmit={e => void form.handleSubmit(handleFormSubmit)(e)}
        >
          <FormLayout>
            {/* Connection Information - Show JSON config for the existing destination */}

            <FormSection title='Cache Configuration'>
              <FormField
                control={form.control}
                name='cacheLifetime'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel tooltip='Period during which query results are served from storage-side cache, avoiding re-execution'>
                      Cache Lifetime
                    </FormLabel>
                    <Select
                      onValueChange={value => {
                        field.onChange(parseInt(value, 10));
                      }}
                      value={field.value.toString()}
                      defaultValue='300'
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Select cache time' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CACHE_TIME_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value.toString()}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    <FormDescription>
                      <LookerStudioCacheLifetimeDescription />
                    </FormDescription>
                  </FormItem>
                )}
              />
            </FormSection>
          </FormLayout>
          <FormActions>
            <Button
              variant='default'
              type='submit'
              className='w-full'
              aria-label={
                mode === ReportFormMode.CREATE ? 'Create new report' : 'Save changes to report'
              }
              disabled={!isDirty || isSubmitting}
            >
              {isSubmitting
                ? mode === ReportFormMode.CREATE
                  ? 'Creating...'
                  : 'Saving...'
                : mode === ReportFormMode.CREATE
                  ? 'Create new report'
                  : 'Save changes to report'}
            </Button>
            {onCancel && (
              <Button
                variant='outline'
                type='button'
                onClick={onCancel}
                className='w-full'
                aria-label='Cancel'
              >
                Cancel
              </Button>
            )}
          </FormActions>
        </AppForm>
      </Form>
    );
  }
);
