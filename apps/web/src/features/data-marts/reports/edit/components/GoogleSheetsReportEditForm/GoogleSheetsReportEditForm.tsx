import { forwardRef, useEffect, useState, useRef } from 'react';
import { useOwnerState } from '../../../../../../shared/hooks';
import { focusFirstInvalidField } from '../../../../../../utils';
import { UserReference } from '../../../../../../shared/components/UserReference';
import { useUser } from '../../../../../idp';
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
  dataDestinationService,
} from '../../../../../data-destination';
import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { showApiErrorToast } from '../../../../../../shared/utils/showApiErrorToast';
import {
  getGoogleSheetTabUrl,
  getGoogleSheetsDestinationEmail,
  isValidGoogleSheetsUrl,
  ReportFormMode,
} from '../../../shared';
import { TimeTriggerAnnouncement } from '../../../../scheduled-triggers';
import {
  ReportSchedulesInlineList,
  type ReportSchedulesInlineListHandle,
} from '../../../../scheduled-triggers/components/ReportSchedulesInlineList/ReportSchedulesInlineList';
import DocumentLinkDescription from './FormDescriptions/DocumentLinkDescription.tsx';
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
import { DEFAULT_REPORT_TITLE } from '../../../shared';
import { useDataMartContext } from '../../../../edit/model';

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
      mode,
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
    } = useGoogleSheetsReportForm({
      initialReport,
      mode,
      dataMartId: dataMart?.id ?? '',
      pendingOwnerIdsRef,
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
          uniqueCountConfig: false,
        });
      }
    }, [initialReport, mode, reset, preSelectedDestination]);

    useEffect(() => {
      onDirtyChange?.(isDirty || triggersDirty || ownersDirty);
    }, [isDirty, triggersDirty, ownersDirty, onDirtyChange]);

    const documentUrl = form.watch('documentUrl');
    const isValidDocumentUrl = documentUrl && isValidGoogleSheetsUrl(documentUrl.trim());

    const selectedDestinationId = form.watch('dataDestinationId');
    const [isCreatingSheet, setIsCreatingSheet] = useState(false);

    const handleCreateGoogleSheet = async () => {
      if (!selectedDestinationId || isCreatingSheet) {
        return;
      }
      // The report has no title yet at creation time (defaults to DEFAULT_REPORT_TITLE),
      // so fall back to the Data Mart title; use the report title once the user set one.
      const reportTitle = form.getValues('title').trim();
      const sheetTitle =
        reportTitle && reportTitle !== DEFAULT_REPORT_TITLE
          ? reportTitle
          : (dataMart?.title ?? reportTitle);
      setIsCreatingSheet(true);
      try {
        const { spreadsheetId, sheetId, placedInRoot, sharedWithRequester } =
          await dataDestinationService.createGoogleSheetDocument(selectedDestinationId, {
            title: sheetTitle,
          });
        form.setValue('documentUrl', getGoogleSheetTabUrl(spreadsheetId, sheetId), {
          shouldDirty: true,
          shouldValidate: true,
        });
        // The backend explicitly flags a downgrade (folder dropped / not shared)
        // when the connected OAuth token lacks a Drive scope. Older backends omit
        // these flags (undefined), so only warn on an explicit true/false.
        if (placedInRoot === true || sharedWithRequester === false) {
          const issues: string[] = [];
          if (placedInRoot === true) {
            issues.push(
              'the selected Drive folder was not used (it was created in your Drive root)'
            );
          }
          if (sharedWithRequester === false) {
            issues.push('it was not shared with you');
          }
          toast(
            `Google Sheet created, but ${issues.join(', and ')}. Reconnect the destination’s ` +
              'Google account with Drive access to fix this.',
            { icon: '⚠️', duration: 8000 }
          );
        } else {
          toast.success('Google Sheet created');
        }
      } catch (error) {
        showApiErrorToast(error, 'Failed to create Google Sheet');
      } finally {
        setIsCreatingSheet(false);
      }
    };

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
                    {field.value &&
                      filteredDestinations.length > 0 &&
                      (() => {
                        const selectedDestination = filteredDestinations.find(
                          destination => destination.id === field.value
                        );
                        if (selectedDestination) {
                          const accessEmail = getGoogleSheetsDestinationEmail(selectedDestination);
                          if (!accessEmail) return null;
                          return (
                            <div className='mt-2 flex flex-col gap-1'>
                              <FormLabel tooltip='Share the Google Sheet with this email to allow writing'>
                                Share document with
                              </FormLabel>
                              <CopyableField value={accessEmail}>{accessEmail}</CopyableField>
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type='button'
                              variant='outline'
                              className='flex-shrink-0'
                              disabled={!selectedDestinationId || isCreatingSheet}
                              onClick={() => void handleCreateGoogleSheet()}
                            >
                              {isCreatingSheet ? (
                                <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
                              ) : null}
                              Create document
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side='top' align='center' role='tooltip'>
                            {selectedDestinationId
                              ? 'Create a new Google Sheet in the selected destination and fill the link above'
                              : 'Select a destination first'}
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
                        <div
                          className='border-border space-y-3 rounded-md border-b bg-white px-4 py-3 dark:border-transparent dark:bg-white/4'
                          tabIndex={-1}
                        >
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
                        </div>
                      </FormControl>
                    )}
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
            onSubmit={() => void form.handleSubmit(handleFormSubmit, focusFirstInvalidField)()}
            onCancel={onCancel}
          />
        </AppForm>
      </Form>
    );
  }
);
