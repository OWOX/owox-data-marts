import { useTheme } from 'next-themes';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { Input } from '@owox/ui/components/input';
import { Editor } from '@monaco-editor/react';
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
  DataDestinationTypeModel,
  useDataDestination,
} from '../../../../../data-destination';
import { CopyableField } from '@owox/ui/components/common/copyable-field';
import { isEmailCredentials } from '../../../../../data-destination/shared/model/types/email-credentials';
import { TimeTriggerAnnouncement } from '../../../../scheduled-triggers';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { ReportFormMode } from '../../../shared';
import { useEmailReportForm } from '../../hooks/useEmailReportForm';
import { ReportConditionEnum } from '../../../shared/enums/report-condition.enum';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@owox/ui/components/tabs';
import apiClient from '../../../../../../app/api/apiClient';
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

    // Tabs for Message editor/preview
    const [messageTab, setMessageTab] = useState<'markdown' | 'preview'>('markdown');

    // Preview state
    const [previewHtml, setPreviewHtml] = useState<string>('');
    const [previewLoading, setPreviewLoading] = useState<boolean>(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Watch markdown content from form
    const messageTemplate = form.watch('messageTemplate');

    // Debounced preview generation when Preview tab is active
    useEffect(() => {
      if (messageTab !== 'preview') return;

      const md = messageTemplate;

      if (!md.trim()) {
        setPreviewHtml('');
        setPreviewError(null);
        setPreviewLoading(false);
        return;
      }

      setPreviewLoading(true);
      setPreviewError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        void (async () => {
          try {
            const res = await apiClient.post<string>(
              '/markdown/parse-to-html',
              { markdown: md },
              {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'text',
                signal: controller.signal,
              }
            );

            const html = res.data;
            setPreviewHtml(html);
          } catch (e: unknown) {
            let isAbort = false;
            let message: string | undefined;
            if (e && typeof e === 'object') {
              const err = e as { name?: string; message?: string };
              isAbort =
                err.name === 'CanceledError' ||
                err.message === 'canceled' ||
                err.name === 'AbortError';
              message = err.message;
            }
            if (!isAbort) {
              setPreviewError(message ?? 'Failed to load preview');
            }
          } finally {
            setPreviewLoading(false);
          }
        })();
      }, 300);

      return () => {
        clearTimeout(timeoutId);
        controller.abort();
      };
    }, [messageTab, messageTemplate]);

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
                            {field.value &&
                              filteredDestinations.length > 0 &&
                              (() => {
                                const selectedDestination = filteredDestinations.find(
                                  d => d.id === field.value
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
                    {field.value &&
                      filteredDestinations.length > 0 &&
                      (() => {
                        const selectedDestination = filteredDestinations.find(
                          d => d.id === field.value
                        );
                        if (selectedDestination) {
                          const creds = selectedDestination.credentials;
                          return (
                            <div className='mt-2 flex flex-col gap-1'>
                              <FormLabel>Recipients of this report</FormLabel>
                              <CopyableField
                                doNotTruncateContent={true}
                                value={
                                  isEmailCredentials(creds) && creds.to.length
                                    ? creds.to.join(', ')
                                    : ''
                                }
                              >
                                {isEmailCredentials(creds) && creds.to.length
                                  ? creds.to.join(', ')
                                  : 'No recipients found'}
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
                      <Tabs
                        value={messageTab}
                        onValueChange={v => {
                          setMessageTab(v as 'markdown' | 'preview');
                        }}
                      >
                        <TabsList className={'h-7'}>
                          <TabsTrigger value='markdown'>Markdown</TabsTrigger>
                          <TabsTrigger value='preview'>Preview</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <FormControl>
                      <div className='overflow-hidden rounded-md border'>
                        <Tabs value={messageTab}>
                          <TabsContent value='markdown'>
                            <Editor
                              language='markdown'
                              height={240}
                              value={field.value}
                              onChange={val => {
                                field.onChange(val ?? '');
                              }}
                              onMount={editor => {
                                // Propagate blur to react-hook-form
                                editor.onDidBlurEditorText(() => {
                                  field.onBlur();
                                });
                              }}
                              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                              options={{
                                wordWrap: 'on',
                                minimap: { enabled: false },
                                lineNumbers: 'off',
                                folding: false,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                placeholder: 'Write a message template.',
                              }}
                            />
                          </TabsContent>

                          <TabsContent value='preview'>
                            <div className='bg-background h-[240px] overflow-auto p-4'>
                              {previewLoading && (
                                <div className='text-muted-foreground text-sm'>
                                  Generating preview…
                                </div>
                              )}
                              {!previewLoading && previewError && (
                                <div className='text-destructive text-sm'>
                                  Error: {previewError}
                                </div>
                              )}
                              {!previewLoading && !previewError && !messageTemplate.trim() && (
                                <div className='text-muted-foreground text-sm'>
                                  Nothing to preview
                                </div>
                              )}
                              {!previewLoading &&
                                !previewError &&
                                !!messageTemplate.trim() &&
                                (() => {
                                  const root = document.documentElement;
                                  const bg = getComputedStyle(root)
                                    .getPropertyValue('--background')
                                    .trim();
                                  const fg = getComputedStyle(root)
                                    .getPropertyValue('--foreground')
                                    .trim();
                                  return (
                                    <iframe
                                      title='Markdown preview'
                                      sandbox='allow-popups allow-popups-to-escape-sandbox'
                                      srcDoc={`<!doctype html><html style="background: ${bg}; color: ${fg}"><head><meta charset="utf-8" /><base target="_blank"></head><body>${previewHtml}</body></html>`}
                                      className='h-full w-full border-0'
                                    />
                                  );
                                })()}
                            </div>
                          </TabsContent>
                        </Tabs>
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
