import { forwardRef, useEffect } from 'react';
import { useOwnerState } from '../../../../../../shared/hooks/useOwnerState';
import { UserReference } from '../../../../../../shared/components/UserReference/UserReference';
import { useUser } from '../../../../../idp/hooks/useAuthState';

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
import { OwnersSection } from '../../../../../../shared/components/OwnersSection/OwnersSection';
import type { UserProjectionDto } from '../../../../../../shared/types/api';

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

    const { dataMart } = useOutletContext<DataMartContextType>();

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
        });
      } else if (mode === ReportFormMode.CREATE) {
        // Pre-select destination if provided
        reset({ cacheLifetime: 300 });
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
          onSubmit={e => void form.handleSubmit(handleFormSubmit)(e)}
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
              disabled={(!isDirty && !ownersDirty) || isSubmitting}
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
