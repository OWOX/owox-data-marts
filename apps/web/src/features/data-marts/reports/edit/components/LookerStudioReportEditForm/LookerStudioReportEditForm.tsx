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
  useDataDestination,
} from '../../../../../data-destination';
import { Link, useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types.ts';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import { ReportFormMode } from '../../../shared';
import { Button } from '@owox/ui/components/button';

interface LookerStudioReportEditFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  onDirtyChange?: (isDirty: boolean) => void;
  formError?: string | null;
  onFormErrorChange?: (error: string | null) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
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
          cacheTime: initialReport.destinationConfig.cacheTime,
        });
      } else if (mode === ReportFormMode.CREATE) {
        reset({ title: '', dataDestinationId: '', cacheTime: 300 });
      }
    }, [initialReport, mode, reset, filteredDestinations]);

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
                      <Input id={titleInputId} placeholder='Report title' {...field} />
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
                                      <IconComponent className='h-4 w-4 flex-shrink-0' />
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
                                <IconComponent className='h-4 w-4 flex-shrink-0' />
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
                      <Alert className='mt-2'>
                        <AlertCircle className='h-4 w-4' />
                        <AlertTitle>No Looker Studio destinations available</AlertTitle>
                        <AlertDescription>
                          You need to create a Looker Studio Destination before you can create a
                          report.{' '}
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
                  </FormItem>
                )}
              />
            </FormSection>
            <FormSection title='Cache Configuration'>
              <FormField
                control={form.control}
                name='cacheTime'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel tooltip='Cache time on the Data Mart side - determines how long Data Mart will serve cached data to Looker Studio'>
                      Cache Time
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
                mode === ReportFormMode.CREATE
                  ? 'Connect to Looker Studio'
                  : 'Save connection settings'
              }
              disabled={!isDirty || isSubmitting}
            >
              {isSubmitting
                ? mode === ReportFormMode.CREATE
                  ? 'Connecting...'
                  : 'Saving...'
                : mode === ReportFormMode.CREATE
                  ? 'Connect to Looker Studio'
                  : 'Save Changes'}
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
