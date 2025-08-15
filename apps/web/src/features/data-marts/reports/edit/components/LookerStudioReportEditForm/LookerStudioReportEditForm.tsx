import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { forwardRef, useEffect, useState } from 'react';
import { Input } from '@owox/ui/components/input';
import { useAutoFocus } from '../../../../../../hooks/useAutoFocus.ts';
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
import {
  type DataDestination,
  DataDestinationType,
  DataDestinationTypeModel,
  generateLookerStudioJsonConfig,
  useDataDestination,
  isLookerStudioDataDestination,
} from '../../../../../data-destination';
import { Link, useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types.ts';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import { CopyToClipboardButton } from '@owox/ui/components/common/copy-to-clipboard-button';
import { ReportFormMode } from '../../../shared';
import { Button } from '@owox/ui/components/button';
import LookerStudioJsonConfigDescription from '../../../../../data-destination/edit/components/DataDestinationEditForm/FormDescriptions/LookerStudioJsonConfigDescription.tsx';
import LookerStudioCacheLifetimeDescription from './LookerStudioCacheLifetimeDescription.tsx';
import type { DataDestinationResponseDto } from '../../../../../data-destination/shared/services/types';

interface LookerStudioReportEditFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  onDirtyChange?: (isDirty: boolean) => void;
  formError?: string | null;
  onFormErrorChange?: (error: string | null) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  preSelectedDestination?: DataDestinationResponseDto | null;
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
    const titleInputId = 'looker-studio-title-input';
    const dataDestinationSelectId = 'looker-studio-data-destination-select';

    const { dataMart } = useOutletContext<DataMartContextType>();
    const {
      dataDestinations,
      fetchDataDestinations,
      loading: loadingDestinations,
    } = useDataDestination();
    const [filteredDestinations, setFilteredDestinations] = useState<DataDestination[]>([]);

    useEffect(() => {
      if (dataMart) {
        void fetchDataDestinations();
      }
    }, [dataMart, fetchDataDestinations]);

    useEffect(() => {
      if (dataDestinations.length > 0) {
        const lookerStudioDestinations = dataDestinations.filter(
          destination => destination.type === DataDestinationType.LOOKER_STUDIO
        );
        setFilteredDestinations(lookerStudioDestinations);
      }
    }, [dataDestinations]);

    useAutoFocus({ elementId: titleInputId, isOpen: true, delay: 150 });

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
          title: initialReport.title,
          dataDestinationId: initialReport.dataDestination.id,
          cacheLifetime: initialReport.destinationConfig.cacheLifetime,
        });
      } else if (mode === ReportFormMode.CREATE) {
        // Pre-select destination if provided
        const destinationId = preSelectedDestination?.id ?? '';
        reset({ title: '', dataDestinationId: destinationId, cacheLifetime: 300 });
      }
    }, [initialReport, mode, reset, filteredDestinations, preSelectedDestination]);

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
            <FormSection title='General'>
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel tooltip='Add a title that reflects the report`s purpose'>
                      Title
                    </FormLabel>
                    <FormControl>
                      <Input id={titleInputId} placeholder='Enter a report title' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='dataDestinationId'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel tooltip='Select one of your existing destinations'>
                      Destination
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={loadingDestinations || filteredDestinations.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger
                          id={dataDestinationSelectId}
                          className='w-full max-w-full overflow-hidden'
                        >
                          <SelectValue className='truncate' placeholder='Select a destination'>
                            {field.value &&
                              filteredDestinations.length > 0 &&
                              (() => {
                                const selectedDestination = filteredDestinations.find(
                                  destination => destination.id === field.value
                                );
                                if (selectedDestination) {
                                  const typeInfo = DataDestinationTypeModel.getInfo(
                                    selectedDestination.type
                                  );
                                  const IconComponent = typeInfo.icon;
                                  return (
                                    <div className='flex w-full min-w-0 items-center gap-2'>
                                      <IconComponent className='flex-shrink-0' size={18} />
                                      <div className='flex min-w-0 flex-col'>
                                        <span className='truncate'>
                                          {selectedDestination.title}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredDestinations.map(destination => {
                          const typeInfo = DataDestinationTypeModel.getInfo(destination.type);
                          const IconComponent = typeInfo.icon;
                          return (
                            <SelectItem key={destination.id} value={destination.id}>
                              <div className='flex w-full min-w-0 items-center gap-2'>
                                <IconComponent className='flex-shrink-0' size={18} />
                                <div className='flex min-w-0 flex-col'>
                                  <span className='truncate'>{destination.title}</span>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {filteredDestinations.length === 0 && !loadingDestinations && (
                      <Alert>
                        <AlertCircle className='h-4 w-4' />
                        <AlertTitle>No Looker Studio destinations available</AlertTitle>
                        <AlertDescription>
                          You need to create a Looker Studio Destination before you can create a
                          report.
                          <Link
                            to='/data-destinations'
                            className='font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                          >
                            Go to Destinations
                          </Link>
                        </AlertDescription>
                      </Alert>
                    )}
                    <FormMessage />
                    {field.value &&
                      (() => {
                        const selectedDestination = filteredDestinations.find(
                          destination => destination.id === field.value
                        );

                        if (
                          selectedDestination &&
                          isLookerStudioDataDestination(selectedDestination)
                        ) {
                          const jsonConfig = generateLookerStudioJsonConfig(
                            selectedDestination.credentials
                          );
                          return (
                            <>
                              <FormLabel className='mt-2'>JSON Configuration</FormLabel>
                              <FormDescription className='mb-1'>
                                To connect to Looker Studio, you need to copy the JSON configuration
                                and use it in the
                                <ExternalAnchor
                                  className='underline'
                                  href='https://datastudio.google.com/datasources/create?connectorId=AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A'
                                >
                                  Looker Studio connector
                                </ExternalAnchor>
                              </FormDescription>
                              <CopyToClipboardButton
                                content={jsonConfig}
                                buttonText='Copy JSON Config'
                                className='w-full'
                                size='sm'
                              />
                              <FormDescription>
                                <LookerStudioJsonConfigDescription />
                              </FormDescription>
                            </>
                          );
                        }
                        return null;
                      })()}
                  </FormItem>
                )}
              />
            </FormSection>
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
