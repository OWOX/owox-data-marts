import { forwardRef, useEffect, useState, useRef } from 'react';
import { useOwnerState } from '../../../../../../shared/hooks';
import { focusFirstInvalidField } from '../../../../../../utils';
import { UserReference } from '../../../../../../shared/components/UserReference';
import { useUser } from '../../../../../idp';
import { Input } from '@owox/ui/components/input';
import { useAutoFocus } from '../../../../../../hooks/useAutoFocus.ts';
import { type DataMartReport } from '../../../shared/model/types/data-mart-report.ts';
import { useReportForm } from '../../hooks/useReportForm.ts';
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
  isPullBasedDestinationType,
  reportNamesTargetDocument,
  useDataDestination,
} from '../../../../../data-destination';
import { Link } from 'react-router';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { AlertCircle } from 'lucide-react';
import {
  getGoogleSheetsDestinationEmail,
  getGoogleSheetsReportDocumentUrl,
  ReportFormMode,
} from '../../../shared';
import { TimeTriggerAnnouncement } from '../../../../scheduled-triggers';
import {
  ReportSchedulesInlineList,
  type ReportSchedulesInlineListHandle,
} from '../../../../scheduled-triggers/components/ReportSchedulesInlineList/ReportSchedulesInlineList';
import { GoogleSheetsTargetSection } from './GoogleSheetsTargetSection';
import { CopyableField } from '@owox/ui/components/common/copyable-field';
import { useReport } from '../../../shared';
import { ReportFormActions } from '../shared/ReportFormActions';
import { OwnersSection } from '../../../../../../shared/components/OwnersSection/OwnersSection';
import type { UserProjectionDto } from '../../../../../../shared/types/api';
import {
  ReportColumnPicker,
  ReportColumnsCountBadge,
  type ReportColumnSelectionCount,
} from '../../../../edit/components/ReportColumnPicker/ReportColumnPicker';
import {
  applyColumnConfigChange,
  applyOutputConfigChange,
} from '../../utils/apply-output-config-change';
import { DEFAULT_REPORT_TITLE } from '../../../shared';
import { useDataMartContext } from '../../../../edit/model';

interface ReportEditFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  onDirtyChange?: (isDirty: boolean) => void;
  formError?: string | null;
  onFormErrorChange?: (error: string | null) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  preSelectedDestination?: DataDestination | null;
}

export const ReportEditForm = forwardRef<HTMLFormElement, ReportEditFormProps>(
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
    const formId = 'report-edit-form';
    const titleInputId = 'report-title-input';
    const documentUrlInputId = 'report-document-url-input';
    const dataDestinationSelectId = 'report-data-destination-select';

    const destinationType =
      preSelectedDestination?.type ??
      initialReport?.dataDestination.type ??
      DataDestinationType.GOOGLE_SHEETS;
    // Only what depends on there being a server-side run: a schedule to put it on, and the
    // offer to run right after saving. What the report writes into is a separate question — see
    // reportNamesTargetDocument.
    const isPullDestination = isPullBasedDestinationType(destinationType);

    const { dataMart } = useDataMartContext();
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
        setFilteredDestinations(
          dataDestinations.filter(destination => destination.type === destinationType)
        );
      }
    }, [dataDestinations, destinationType]);

    useAutoFocus({ elementId: titleInputId, isOpen: true, delay: 150 });

    const scheduleRef = useRef<ReportSchedulesInlineListHandle | null>(null);
    const runAfterSaveRef = useRef(false);
    const [triggersDirty, setTriggersDirty] = useState(false);
    const [columnsCount, setColumnsCount] = useState<ReportColumnSelectionCount>({
      selected: 0,
      total: 0,
    });
    const { runReport } = useReport();

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
    } = useReportForm({
      initialReport,
      mode,
      dataMartId: dataMart?.id ?? '',
      pendingOwnerIdsRef,
      destinationType,
      onAfterSubmit: async report => {
        try {
          await scheduleRef.current?.persist(report.id);
        } catch (e) {
          // ignore UI errors here; hook will handle formError
          console.error('Failed to persist schedule for report', e);
        }
        consumePendingOwnerIds();
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
      if (mode === ReportFormMode.EDIT && initialReport) {
        // Only the document URL depends on which destination this is, and it answers empty for
        // one that names no document. Everything else is the same everywhere, so gating the
        // whole reset on a Google Sheets config left an Excel report showing whatever the form
        // was mounted with.
        reset({
          title: initialReport.title,
          documentUrl: getGoogleSheetsReportDocumentUrl(initialReport.destinationConfig),
          dataDestinationId: initialReport.dataDestination.id,
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
        const destinationId = preSelectedDestination?.id ?? '';
        reset({
          title: DEFAULT_REPORT_TITLE,
          documentUrl: '',
          dataDestinationId: destinationId,
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dateTruncConfig: null,
          uniqueCountConfig: [],
        });
      }
    }, [initialReport, mode, reset, preSelectedDestination]);

    useEffect(() => {
      onDirtyChange?.(isDirty || triggersDirty || ownersDirty);
    }, [isDirty, triggersDirty, ownersDirty, onDirtyChange]);

    const selectedDestinationId = form.watch('dataDestinationId');
    const selectedDestination = filteredDestinations.find(
      destination => destination.id === selectedDestinationId
    );
    const selectedDestinationEmail = selectedDestination
      ? getGoogleSheetsDestinationEmail(selectedDestination)
      : undefined;
    return (
      <Form {...form}>
        <AppForm
          id={formId}
          ref={ref}
          noValidate
          onSubmit={e => void form.handleSubmit(handleFormSubmit, focusFirstInvalidField)(e)}
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
                      disabled={
                        isPullDestination ||
                        loadingDestinations ||
                        filteredDestinations.length === 0
                      }
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
                          const accessEmail = getGoogleSheetsDestinationEmail(destination);
                          return (
                            <SelectItem key={destination.id} value={destination.id}>
                              <div className='flex w-full min-w-0 items-center gap-2'>
                                <IconComponent className='flex-shrink-0' size={18} />
                                <div className='flex min-w-0 flex-col'>
                                  <span className='truncate'>{destination.title}</span>
                                  {accessEmail && (
                                    <span className='text-muted-foreground truncate text-xs'>
                                      {accessEmail}
                                    </span>
                                  )}
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
                    {field.value && selectedDestinationEmail && (
                      <div className='mt-2 flex flex-col gap-1'>
                        <FormLabel tooltip='Share the Google Sheet with this email to allow writing'>
                          Share document with
                        </FormLabel>
                        <CopyableField value={selectedDestinationEmail}>
                          {selectedDestinationEmail}
                        </CopyableField>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* The same answer the hook uses to build the config, so the form cannot ask for
                  a document the report will not store, or store one it never asked for. */}
              {reportNamesTargetDocument(destinationType) && (
                <GoogleSheetsTargetSection
                  form={form}
                  destinationId={selectedDestinationId}
                  accessEmail={selectedDestinationEmail}
                  dataMartTitle={dataMart?.title}
                  inputId={documentUrlInputId}
                />
              )}
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
                'uniqueCountConfig',
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
                            dataMartTitle={dataMart.title}
                            storageType={dataMart.storage.type}
                            value={form.watch('columnConfig')}
                            onChange={(value, options) => {
                              applyColumnConfigChange(form, value, options);
                            }}
                            outputConfig={{
                              filterConfig: form.watch('filterConfig') ?? [],
                              sortConfig: form.watch('sortConfig') ?? [],
                              limitConfig: form.watch('limitConfig') ?? null,
                              aggregationConfig: form.watch('aggregationConfig') ?? [],
                              dateTruncConfig: form.watch('dateTruncConfig') ?? [],
                              uniqueCountConfig: form.watch('uniqueCountConfig'),
                            }}
                            onOutputConfigChange={(config, options) => {
                              applyOutputConfigChange(form, config, options);
                            }}
                            onCountChange={setColumnsCount}
                          />
                        </div>
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>
            {/* Nothing to schedule: a pull report is refreshed by its consumer, and the
                server has no run to put on a timer. */}
            {!isPullDestination && (
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
            )}

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

          <ReportFormActions
            mode={mode}
            isSubmitting={isSubmitting || form.formState.isSubmitting}
            isDirty={isDirty}
            triggersDirty={triggersDirty}
            ownersDirty={ownersDirty}
            runAfterSaveRef={runAfterSaveRef}
            canRunAfterSave={!isPullDestination}
            onSubmit={() => void form.handleSubmit(handleFormSubmit, focusFirstInvalidField)()}
            onCancel={onCancel}
          />
        </AppForm>
      </Form>
    );
  }
);
