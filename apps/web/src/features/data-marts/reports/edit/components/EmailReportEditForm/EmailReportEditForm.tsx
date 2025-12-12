import { forwardRef, useEffect, useMemo, useState, useRef } from 'react';
import { Input } from '@owox/ui/components/input';
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useDataMartContext } from '../../../../edit/model';
import {
  type DataDestination,
  DataDestinationType,
  useDataDestination,
} from '../../../../../data-destination';
import { DestinationOptionContent } from './DestinationOptionContent.tsx';
import { RecipientsDisplay } from './RecipientsDisplay.tsx';
import { TimeTriggerAnnouncement } from '../../../../scheduled-triggers';
import {
  ReportSchedulesInlineList,
  type ReportSchedulesInlineListHandle,
} from '../../../../scheduled-triggers/components/ReportSchedulesInlineList/ReportSchedulesInlineList';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportFormMode } from '../../../shared';
import { useEmailReportForm } from '../../hooks/useEmailReportForm';
import { ReportConditionEnum } from '../../../shared/enums/report-condition.enum';
import {
  MarkdownEditorPreview,
  MarkdownEditorTabs,
  useMarkdownPreview,
} from '../../../../../../shared/components/MarkdownEditor';
import { InsightEditor } from '../../../../insights/components/InsightEditor';
import { InsightsProvider } from '../../../../insights/model';
import MessageTemplateDescription from './FormDescriptions/MessageTemplateDescription.tsx';
import SendingConditionDescription from './FormDescriptions/SendingConditionDescription.tsx';
import { DataDestinationConfigSheet } from '../../../../../data-destination/edit';
import type { DataDestinationFormData } from '../../../../../data-destination';
import { useReport } from '../../../shared';
import { ReportFormActions } from '../shared/ReportFormActions';

export interface EmailReportEditFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  onDirtyChange?: (isDirty: boolean) => void;
  formError?: string | null;
  onFormErrorChange?: (error: string | null) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  preSelectedDestination?: DataDestination | null;
  prefill?: {
    title?: string;
    subject?: string;
    messageTemplate?: string;
  };
  allowedDestinationTypes?: DataDestinationType[];
}

const MESSAGE_DESTINATION_TYPES: DataDestinationType[] = [
  DataDestinationType.EMAIL,
  DataDestinationType.SLACK,
  DataDestinationType.GOOGLE_CHAT,
  DataDestinationType.MS_TEAMS,
];

export const EmailReportEditForm = forwardRef<HTMLFormElement, EmailReportEditFormProps>(
  (
    {
      initialReport,
      mode = ReportFormMode.EDIT,
      onDirtyChange,
      onFormErrorChange,
      onSubmit,
      onCancel,
      preSelectedDestination,
      prefill,
      allowedDestinationTypes,
    },
    ref
  ) => {
    const formId = 'email-report-edit-form';
    const { dataMart } = useDataMartContext();
    const scheduleRef = useRef<ReportSchedulesInlineListHandle | null>(null);
    const runAfterSaveRef = useRef(false);
    const [triggersDirty, setTriggersDirty] = useState(false);
    const { runReport } = useReport();

    const {
      dataDestinations,
      fetchDataDestinations,
      loading: loadingDestinations,
    } = useDataDestination();
    const [filteredDestinations, setFilteredDestinations] = useState<DataDestination[]>([]);
    const [isCreateDestinationOpen, setIsCreateDestinationOpen] = useState(false);

    useEffect(() => {
      if (dataMart) {
        void fetchDataDestinations();
      }
    }, [dataMart, fetchDataDestinations]);

    useEffect(() => {
      if (dataDestinations.length > 0) {
        const allowedTypes =
          allowedDestinationTypes ??
          (preSelectedDestination?.type
            ? [preSelectedDestination.type]
            : MESSAGE_DESTINATION_TYPES);

        const filtered = dataDestinations.filter(d => allowedTypes.includes(d.type));
        setFilteredDestinations(filtered);
      }
    }, [dataDestinations, preSelectedDestination?.type, allowedDestinationTypes]);

    const {
      isDirty,
      reset,
      form,
      isSubmitting,
      formError: internalFormError,
      onSubmit: handleFormSubmit,
    } = useEmailReportForm({
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
      if (onFormErrorChange) onFormErrorChange(internalFormError);
    }, [internalFormError, onFormErrorChange]);

    useEffect(() => {
      if (mode === ReportFormMode.EDIT && initialReport) {
        // values already provided via defaultValues in hook
      } else if (mode === ReportFormMode.CREATE) {
        const destinationId = preSelectedDestination?.id ?? '';
        reset({
          title: prefill?.title ?? '',
          dataDestinationId: destinationId,
          reportCondition: ReportConditionEnum.ALWAYS,
          subject: prefill?.subject ?? '',
          messageTemplate: prefill?.messageTemplate ?? '',
        });
      }
    }, [
      initialReport,
      mode,
      reset,
      preSelectedDestination,
      prefill?.title,
      prefill?.subject,
      prefill?.messageTemplate,
    ]);

    useEffect(() => {
      onDirtyChange?.(isDirty || triggersDirty);
    }, [isDirty, triggersDirty, onDirtyChange]);

    const reportConditionOptions = useMemo(
      () => [
        { value: ReportConditionEnum.ALWAYS, label: 'Send always' },
        { value: ReportConditionEnum.RESULT_IS_EMPTY, label: 'Send only when result is empty' },
        {
          value: ReportConditionEnum.RESULT_IS_NOT_EMPTY,
          label: 'Send only when result is not empty',
        },
      ],
      []
    );

    // Tabs for Message editor/preview
    const [messageTab, setMessageTab] = useState<'markdown' | 'preview'>('markdown');

    // Watch markdown content from form
    const messageTemplate = form.watch('messageTemplate');

    const {
      html: previewHtml,
      loading: previewLoading,
      error: previewError,
    } = useMarkdownPreview({
      markdown: messageTemplate,
      enabled: messageTab === 'preview',
    });

    // Track currently selected destination id via form
    const selectedDestinationId = form.watch('dataDestinationId');

    // Memoize the selected destination to avoid repeated searches and IIFEs in JSX
    const selectedDestination = useMemo(() => {
      return selectedDestinationId && filteredDestinations.length > 0
        ? (filteredDestinations.find(d => d.id === selectedDestinationId) ?? null)
        : null;
    }, [selectedDestinationId, filteredDestinations]);

    return (
      <>
        <Form {...form}>
          <AppForm
            id={formId}
            ref={ref}
            noValidate
            onSubmit={e => {
              void form.handleSubmit(handleFormSubmit)(e);
            }}
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
                        <Input placeholder='Enter a report title' {...field} />
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
                      <div className='flex items-center justify-between gap-2'>
                        <FormLabel tooltip='Select one of your existing destinations'>
                          Destination
                        </FormLabel>
                      </div>
                      <Select
                        onValueChange={value => {
                          if (value === '__create_new__') {
                            setIsCreateDestinationOpen(true);
                            return;
                          }
                          field.onChange(value);
                        }}
                        value={field.value}
                        disabled={loadingDestinations}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full max-w-full overflow-hidden'>
                            <SelectValue className='truncate' placeholder='Select a destination'>
                              {selectedDestination && (
                                <DestinationOptionContent destination={selectedDestination} />
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredDestinations.map(destination => (
                            <SelectItem key={destination.id} value={destination.id}>
                              <DestinationOptionContent destination={destination} />
                            </SelectItem>
                          ))}
                          {filteredDestinations.length > 0 && <SelectSeparator />}
                          {!preSelectedDestination && (
                            <SelectItem value='__create_new__'>+ Create new</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <RecipientsDisplay destination={selectedDestination} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

              <FormSection title='Template'>
                <FormField
                  control={form.control}
                  name='subject'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel tooltip='Add a short, clear subject line for your report'>
                        Subject
                      </FormLabel>
                      <FormControl>
                        <Input placeholder='Enter a message title' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='messageTemplate'
                  render={({ field }) => (
                    <FormItem>
                      <div className='flex items-center justify-between gap-2'>
                        <FormLabel tooltip='Write your report message in Markdown and check the final format in Preview'>
                          Message
                        </FormLabel>
                        <MarkdownEditorTabs value={messageTab} onChange={setMessageTab} />
                      </div>

                      <FormControl>
                        <div className='overflow-hidden rounded-md border'>
                          {messageTab === 'markdown' ? (
                            <InsightsProvider>
                              <InsightEditor
                                value={field.value}
                                onChange={v => {
                                  field.onChange(v);
                                }}
                                height={240}
                                showLineNumbers={false}
                              />
                            </InsightsProvider>
                          ) : (
                            <MarkdownEditorPreview
                              html={previewHtml}
                              loading={previewLoading}
                              error={previewError}
                              height={240}
                            />
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        <MessageTemplateDescription />
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

              <FormSection title='Sending conditions'>
                <FormField
                  control={form.control}
                  name='reportCondition'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel tooltip='Define when the report should be sent based on your Data Mart’s execution result'>
                        Data Mart Run results
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className='w-full max-w-full overflow-hidden'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {reportConditionOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        <SendingConditionDescription />
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

        {/* Inline create destination flow */}
        <DataDestinationConfigSheet
          isOpen={isCreateDestinationOpen}
          onClose={() => {
            setIsCreateDestinationOpen(false);
          }}
          dataDestination={null}
          initialFormData={
            {
              title: 'New Destination',
              type: allowedDestinationTypes?.[0] ?? DataDestinationType.EMAIL,
            } as DataDestinationFormData
          }
          allowedDestinationTypes={allowedDestinationTypes}
          onSaveSuccess={dest => {
            void fetchDataDestinations().then(() => {
              form.setValue('dataDestinationId', dest.id, { shouldDirty: true, shouldTouch: true });
              setIsCreateDestinationOpen(false);
            });
          }}
        />
      </>
    );
  }
);

EmailReportEditForm.displayName = 'EmailReportEditForm';
