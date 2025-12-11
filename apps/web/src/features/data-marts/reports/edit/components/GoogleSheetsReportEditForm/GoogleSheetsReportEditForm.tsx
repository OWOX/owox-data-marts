import { forwardRef, useEffect, useState, useRef } from 'react';
import { Input } from '@owox/ui/components/input';
import { useAutoFocus } from '../../../../../../hooks/useAutoFocus.ts';
import {
  type DataMartReport,
  isGoogleSheetsDestinationConfig,
} from '../../../shared/model/types/data-mart-report.ts';
import { useGoogleSheetsReportForm } from '../../hooks/useGoogleSheetsReportForm.ts';
import {
  Form,
  AppForm,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormLayout,
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
  useDataDestination,
} from '../../../../../data-destination';
import { Link, useOutletContext } from 'react-router-dom';
import { useProjectRoute } from '../../../../../../shared/hooks';
import type { DataMartContextType } from '../../../../edit/model/context/types.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle, ExternalLink } from 'lucide-react';
import {
  extractServiceAccountEmail,
  getGoogleSheetTabUrl,
  isValidGoogleSheetsUrl,
  ReportFormMode,
} from '../../../shared';
import { TimeTriggerAnnouncement } from '../../../../scheduled-triggers';
import {
  ReportSchedulesInlineList,
  type ReportSchedulesInlineListHandle,
} from '../../../../scheduled-triggers/components/ReportSchedulesInlineList/ReportSchedulesInlineList';
import DocumentLinkDescription from './FormDescriptions/DocumentLinkDescription.tsx';
import { isGoogleServiceAccountCredentials } from '../../../../../../shared/types';
import { CopyableField } from '@owox/ui/components/common/copyable-field';
import { useReport } from '../../../shared';
import { ReportFormActions } from '../shared/ReportFormActions';

interface GoogleSheetsReportEditFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  onDirtyChange?: (isDirty: boolean) => void;
  formError?: string | null;
  onFormErrorChange?: (error: string | null) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  preSelectedDestination?: DataDestination | null;
}

export const GoogleSheetsReportEditForm = forwardRef<
  HTMLFormElement,
  GoogleSheetsReportEditFormProps
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
    const formId = 'google-sheets-edit-form';
    const titleInputId = 'google-sheets-title-input';
    const documentUrlInputId = 'google-sheets-document-url-input';
    const dataDestinationSelectId = 'google-sheets-data-destination-select';

    const { dataMart } = useOutletContext<DataMartContextType>();
    const { scope } = useProjectRoute();
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
        const googleSheetsDestinations = dataDestinations.filter(
          destination => destination.type === DataDestinationType.GOOGLE_SHEETS
        );
        setFilteredDestinations(googleSheetsDestinations);
      }
    }, [dataDestinations]);

    useAutoFocus({ elementId: titleInputId, isOpen: true, delay: 150 });

    const scheduleRef = useRef<ReportSchedulesInlineListHandle | null>(null);
    const runAfterSaveRef = useRef(false);
    const [triggersDirty, setTriggersDirty] = useState(false);
    const { runReport } = useReport();

    const {
      isDirty,
      reset,
      form,
      isSubmitting,
      formError: internalFormError,
      onSubmit: handleFormSubmit,
    } = useGoogleSheetsReportForm({
      initialReport,
      mode,
      dataMartId: dataMart?.id ?? '',
      onAfterSubmit: async report => {
        try {
          await scheduleRef.current?.persist(report.id);
        } catch (e) {
          // ignore UI errors here; hook will handle formError
          console.error('Failed to persist schedule for report', e);
        }
        if (runAfterSaveRef.current) {
          try {
            await runReport(report.id);
          } catch (e) {
            console.error('Failed to run report', e);
            throw e;
          } finally {
            runAfterSaveRef.current = false;
          }
        }
      },
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
        isGoogleSheetsDestinationConfig(initialReport.destinationConfig)
      ) {
        reset({
          title: initialReport.title,
          documentUrl: getGoogleSheetTabUrl(
            initialReport.destinationConfig.spreadsheetId,
            initialReport.destinationConfig.sheetId
          ),
          dataDestinationId: initialReport.dataDestination.id,
        });
      } else if (mode === ReportFormMode.CREATE) {
        // Pre-select destination if provided
        const destinationId = preSelectedDestination?.id ?? '';
        reset({ title: '', documentUrl: '', dataDestinationId: destinationId });
      }
    }, [initialReport, mode, reset, preSelectedDestination]);

    useEffect(() => {
      onDirtyChange?.(isDirty || triggersDirty);
    }, [isDirty, triggersDirty, onDirtyChange]);

    const documentUrl = form.watch('documentUrl');
    const isValidDocumentUrl = documentUrl && isValidGoogleSheetsUrl(documentUrl.trim());

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
                                  <span className='text-muted-foreground truncate text-xs'>
                                    {(isGoogleServiceAccountCredentials(destination.credentials) &&
                                      extractServiceAccountEmail(
                                        destination.credentials.serviceAccount
                                      )) ??
                                      'No email found'}
                                  </span>
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
                        <AlertTitle>No destinations available</AlertTitle>
                        <AlertDescription>
                          You need to create a Destination before you can create a report.{' '}
                          <Link
                            to={scope('/data-destinations')}
                            className='font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                          >
                            Go to Destinations
                          </Link>
                        </AlertDescription>
                      </Alert>
                    )}
                    {field.value &&
                      filteredDestinations.length > 0 &&
                      (() => {
                        const selectedDestination = filteredDestinations.find(
                          destination => destination.id === field.value
                        );
                        if (selectedDestination) {
                          return (
                            <div className='mt-2 flex flex-col gap-1'>
                              <FormLabel>Service Account Email</FormLabel>
                              <CopyableField
                                value={
                                  isGoogleServiceAccountCredentials(selectedDestination.credentials)
                                    ? (extractServiceAccountEmail(
                                        selectedDestination.credentials.serviceAccount
                                      ) ?? 'No email found')
                                    : ''
                                }
                              >
                                {isGoogleServiceAccountCredentials(selectedDestination.credentials)
                                  ? extractServiceAccountEmail(
                                      selectedDestination.credentials.serviceAccount
                                    )
                                  : 'No email found'}
                              </CopyableField>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='documentUrl'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel tooltip='The link must include the Sheet ID to insert data into the correct tab'>
                      Document Link with Sheet ID (GID)
                    </FormLabel>
                    <FormControl>
                      <div className='flex items-center gap-2'>
                        <Input
                          id={documentUrlInputId}
                          placeholder='Document URL'
                          className='flex-1'
                          {...field}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type='button'
                              className={`flex-shrink-0 rounded-md p-2 transition-all duration-200 ${
                                isValidDocumentUrl
                                  ? 'text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/20 dark:hover:text-blue-300'
                                  : 'text-muted-foreground/30 cursor-not-allowed'
                              }`}
                              onClick={() => {
                                if (isValidDocumentUrl) {
                                  window.open(documentUrl.trim(), '_blank', 'noopener,noreferrer');
                                }
                              }}
                              disabled={!isValidDocumentUrl}
                              aria-label={
                                isValidDocumentUrl
                                  ? 'Open document in new tab'
                                  : 'Document link is not valid'
                              }
                            >
                              <ExternalLink className='h-4 w-4' aria-hidden='true' />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side='top' align='center' role='tooltip'>
                            {isValidDocumentUrl
                              ? 'Open document in new tab'
                              : 'Enter a valid URL to enable link'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </FormControl>
                    <FormDescription>
                      <DocumentLinkDescription />
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>
            <FormSection title='Automate Report Runs'>
              {dataMart?.id ? (
                <ReportSchedulesInlineList
                  ref={scheduleRef}
                  dataMartId={dataMart.id}
                  reportId={mode === ReportFormMode.EDIT ? (initialReport?.id ?? null) : null}
                  onDirtyChange={setTriggersDirty}
                />
              ) : (
                <TimeTriggerAnnouncement />
              )}
            </FormSection>
          </FormLayout>
          <ReportFormActions
            mode={mode}
            isSubmitting={isSubmitting}
            isDirty={isDirty}
            triggersDirty={triggersDirty}
            onRunAndSave={() => {
              runAfterSaveRef.current = true;
              void form.handleSubmit(handleFormSubmit)();
            }}
            onCancel={onCancel}
          />
        </AppForm>
      </Form>
    );
  }
);
