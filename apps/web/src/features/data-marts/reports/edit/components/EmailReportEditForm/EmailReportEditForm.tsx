import { useTheme } from 'next-themes';
import { forwardRef, useEffect, useMemo, useState } from 'react';
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
import { Button } from '@owox/ui/components/button';
import { useOutletContext } from 'react-router-dom';
import type { DataMartContextType } from '../../../../edit/model/context/types';
import {
  type DataDestination,
  DataDestinationType,
  useDataDestination,
} from '../../../../../data-destination';
import { DestinationOptionContent } from './DestinationOptionContent.tsx';
import { RecipientsDisplay } from './RecipientsDisplay.tsx';
import { TimeTriggerAnnouncement } from '../../../../scheduled-triggers';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportFormMode } from '../../../shared';
import { useEmailReportForm } from '../../hooks/useEmailReportForm';
import { ReportConditionEnum } from '../../../shared/enums/report-condition.enum';
import {
  MarkdownEditor,
  MarkdownEditorPreview,
  MarkdownEditorTabs,
  useMarkdownPreview,
} from '../../../../../../shared/components/MarkdownEditor';
import MessageTemplateDescription from './FormDescriptions/MessageTemplateDescription.tsx';
import SendingConditionDescription from './FormDescriptions/SendingConditionDescription.tsx';

interface EmailReportEditFormProps {
  initialReport?: DataMartReport;
  mode: ReportFormMode;
  onDirtyChange?: (isDirty: boolean) => void;
  formError?: string | null;
  onFormErrorChange?: (error: string | null) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  preSelectedDestination?: DataDestination | null;
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
    },
    ref
  ) => {
    const formId = 'email-report-edit-form';
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
        // Show only message-like destinations; if preSelectedDestination provided, prefer that type
        const allowedTypes = preSelectedDestination?.type
          ? [preSelectedDestination.type]
          : MESSAGE_DESTINATION_TYPES;
        const filtered = dataDestinations.filter(d => allowedTypes.includes(d.type));
        setFilteredDestinations(filtered);
      }
    }, [dataDestinations, preSelectedDestination?.type]);

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
      onSuccess: () => {
        onSubmit?.();
      },
      preSelectedDestination,
    });

    useEffect(() => {
      if (onFormErrorChange) onFormErrorChange(internalFormError);
    }, [internalFormError, onFormErrorChange]);

    useEffect(() => {
      // initialize form defaults depending on mode
      if (mode === ReportFormMode.EDIT && initialReport) {
        // values already provided via defaultValues in hook
      } else if (mode === ReportFormMode.CREATE) {
        const destinationId = preSelectedDestination?.id ?? '';
        reset({
          title: '',
          dataDestinationId: destinationId,
          reportCondition: ReportConditionEnum.ALWAYS,
          subject: '',
          messageTemplate: '',
        });
      }
    }, [initialReport, mode, reset, preSelectedDestination]);

    useEffect(() => {
      onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

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

    const { resolvedTheme } = useTheme();
    const markdownEditorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

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
                    <FormLabel tooltip='Select one of your existing destinations'>
                      Destination
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={loadingDestinations || filteredDestinations.length === 0}
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
                      <Input placeholder='Email subject' {...field} />
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
                          <MarkdownEditor
                            value={field.value}
                            onChange={v => {
                              field.onChange(v);
                            }}
                            onBlur={field.onBlur}
                            height={240}
                            theme={markdownEditorTheme}
                          />
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
              <TimeTriggerAnnouncement />
            </FormSection>

            <FormActions>
              <Button type='button' variant='outline' onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {mode === ReportFormMode.CREATE ? 'Create' : 'Save changes'}
              </Button>
            </FormActions>
          </FormLayout>
        </AppForm>
      </Form>
    );
  }
);

EmailReportEditForm.displayName = 'EmailReportEditForm';
