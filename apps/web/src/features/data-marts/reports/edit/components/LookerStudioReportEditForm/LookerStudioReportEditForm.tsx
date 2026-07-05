import { forwardRef, useEffect, useState } from 'react';
import { useOwnerState } from '../../../../../../shared/hooks';
import { focusFirstInvalidField } from '../../../../../../utils';
import { UserReference } from '../../../../../../shared/components/UserReference';
import { useUser } from '../../../../../idp';

import {
  type DataMartReport,
  isLookerStudioDestinationConfig,
} from '../../../shared/model/types/data-mart-report.ts';
import { isGeneratedSqlSupported } from '../../../shared';
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
import { type DataDestination } from '../../../../../data-destination';
import { ReportFormMode } from '../../../shared';
import { Button } from '@owox/ui/components/button';
import LookerStudioCacheLifetimeDescription from './LookerStudioCacheLifetimeDescription.tsx';
import { OwnersSection } from '../../../../../../shared/components/OwnersSection/OwnersSection';
import type { UserProjectionDto } from '../../../../../../shared/types/api';
import {
  ReportColumnPicker,
  ReportColumnsCountBadge,
  type ReportColumnSelectionCount,
} from '../../../../edit/components/ReportColumnPicker/ReportColumnPicker';
import { GeneratedSqlViewer } from '../../../../edit/components/ReportColumnPicker/GeneratedSqlViewer';
import { useDataMartContext } from '../../../../edit/model';

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
      mode,
      onDirtyChange,
      onFormErrorChange,
      onSubmit,
      onCancel,
      preSelectedDestination,
    },
    ref
  ) => {
    const formId = 'looker-studio-edit-form';

    const { dataMart } = useDataMartContext();
    const [columnsCount, setColumnsCount] = useState<ReportColumnSelectionCount>({
      selected: 0,
      total: 0,
    });

    const currentUser = useUser();
    const initialOwnerUsers =
      (initialReport?.ownerUsers as UserProjectionDto[] | undefined) ??
      (currentUser
        ? [
            {
              userId: currentUser.id,
              fullName: currentUser.fullName ?? null,
              email: currentUser.email ?? null,
              avatar: currentUser.avatar ?? null,
            },
          ]
        : []);
    const {
      ownerUsers,
      ownersDirty,
      pendingOwnerIdsRef,
      handleOwnersChange,
      consumePendingOwnerIds,
    } = useOwnerState(initialOwnerUsers);

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
      pendingOwnerIdsRef,
      onSuccess: () => {
        consumePendingOwnerIds();
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
          columnConfig: initialReport.columnConfig ?? null,
          filterConfig: initialReport.filterConfig ?? null,
          sortConfig: initialReport.sortConfig ?? null,
          limitConfig: initialReport.limitConfig ?? null,
          aggregationConfig: initialReport.aggregationConfig ?? null,
          dateTruncConfig: initialReport.dateTruncConfig ?? null,
          uniqueCountConfig: initialReport.uniqueCountConfig,
        });
      } else if (mode === ReportFormMode.CREATE) {
        // Pre-select destination if provided
        reset({
          cacheLifetime: 300,
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dateTruncConfig: null,
          uniqueCountConfig: false,
        });
      }
    }, [initialReport, mode, reset]);

    useEffect(() => {
      onDirtyChange?.(isDirty || ownersDirty);
    }, [isDirty, ownersDirty, onDirtyChange]);

    return (
      <Form {...form}>
        <AppForm
          id={formId}
          ref={ref}
          noValidate
          onSubmit={e => void form.handleSubmit(handleFormSubmit, focusFirstInvalidField)(e)}
        >
          <FormLayout>
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

            <FormSection
              title='Report Columns'
              tooltip='Select which columns to include in the report'
              titleAdornment={<ReportColumnsCountBadge count={columnsCount} />}
              fields={[
                'columnConfig',
                'filterConfig',
                'sortConfig',
                'limitConfig',
                'aggregationConfig',
                'dateTruncConfig',
              ]}
            >
              <FormField
                control={form.control}
                name='columnConfig'
                render={() => (
                  <FormItem>
                    {dataMart?.id && (
                      <FormControl>
                        <div className='space-y-3' tabIndex={-1}>
                          <ReportColumnPicker
                            dataMartId={dataMart.id}
                            storageType={dataMart.storage.type}
                            value={form.watch('columnConfig')}
                            onChange={value => {
                              form.setValue('columnConfig', value, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                            }}
                            outputConfig={{
                              filterConfig: form.watch('filterConfig') ?? [],
                              sortConfig: form.watch('sortConfig') ?? [],
                              limitConfig: form.watch('limitConfig') ?? null,
                              aggregationConfig: form.watch('aggregationConfig') ?? [],
                              dateTruncConfig: form.watch('dateTruncConfig') ?? [],
                              uniqueCountConfig: form.watch('uniqueCountConfig'),
                            }}
                            onOutputConfigChange={config => {
                              form.setValue('filterConfig', config.filterConfig, {
                                shouldDirty: true,
                              });
                              form.setValue('sortConfig', config.sortConfig, {
                                shouldDirty: true,
                              });
                              form.setValue('limitConfig', config.limitConfig, {
                                shouldDirty: true,
                              });
                              form.setValue('aggregationConfig', config.aggregationConfig, {
                                shouldDirty: true,
                              });
                              form.setValue('dateTruncConfig', config.dateTruncConfig, {
                                shouldDirty: true,
                              });
                              form.setValue('uniqueCountConfig', config.uniqueCountConfig, {
                                shouldDirty: true,
                              });
                            }}
                            onCountChange={setColumnsCount}
                          />
                          {mode === ReportFormMode.EDIT &&
                            initialReport?.id &&
                            dataMart.id &&
                            isGeneratedSqlSupported(
                              dataMart.definitionType,
                              dataMart.storage.type
                            ) && (
                              <div className='pt-1'>
                                <GeneratedSqlViewer
                                  reportId={initialReport.id}
                                  dataMartId={dataMart.id}
                                  variant='outline-button'
                                />
                              </div>
                            )}
                        </div>
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <FormSection title='Ownership'>
              <FormItem>
                <FormLabel tooltip='Team members responsible for this report'>Owners</FormLabel>
                <OwnersSection ownerUsers={ownerUsers} onSave={handleOwnersChange} />
              </FormItem>
            </FormSection>

            {initialReport?.createdAt && (
              <FormSection title='Details'>
                <FormItem>
                  <FormLabel>Created By</FormLabel>
                  <div className='text-sm'>
                    {initialReport.createdByUser ? (
                      <UserReference userProjection={initialReport.createdByUser} variant='full' />
                    ) : (
                      <span className='text-muted-foreground'>Unknown</span>
                    )}
                  </div>
                </FormItem>
                <FormItem>
                  <FormLabel>Created At</FormLabel>
                  <div className='text-muted-foreground text-sm'>
                    {new Date(initialReport.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </FormItem>
              </FormSection>
            )}
          </FormLayout>
          <FormActions>
            <Button
              variant='default'
              type='submit'
              className='w-full'
              aria-label={mode === ReportFormMode.CREATE ? 'Create' : 'Save changes'}
              // In CREATE mode the button stays clickable even while the form is
              // invalid: submitting surfaces validation errors instead of leaving
              // the user with a disabled button and no hint about what is missing.
              disabled={isSubmitting || (mode === ReportFormMode.EDIT && !isDirty && !ownersDirty)}
            >
              {isSubmitting
                ? mode === ReportFormMode.CREATE
                  ? 'Creating...'
                  : 'Saving...'
                : mode === ReportFormMode.CREATE
                  ? 'Create'
                  : 'Save changes'}
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
