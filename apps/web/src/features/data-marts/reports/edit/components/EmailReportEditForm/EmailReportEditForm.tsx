import { forwardRef, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Edit2, Eye, FileCode, ExternalLink, Sparkles, Plus } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { Input } from '@owox/ui/components/input';
import { Button } from '@owox/ui/components/button';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@owox/ui/components/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
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
import { ReportFormMode, TemplateSourceTypeEnum } from '../../../shared';
import { useEmailReportForm } from '../../hooks/useEmailReportForm';
import { ReportConditionEnum } from '../../../shared/enums/report-condition.enum';
import {
  MarkdownEditorPreview,
  useMarkdownPreview,
} from '../../../../../../shared/components/MarkdownEditor';
import {
  InsightTemplateEditor,
  useInsightTemplates,
  insightTemplatesService,
} from '../../../../insights';
import { InsightsProvider } from '../../../../insights';
import MessageTemplateDescription from './FormDescriptions/MessageTemplateDescription.tsx';
import SendingConditionDescription from './FormDescriptions/SendingConditionDescription.tsx';
import { DataDestinationConfigSheet } from '../../../../../data-destination/edit';
import type { DataDestinationFormData } from '../../../../../data-destination';
import { useReport } from '../../../shared';
import { isEmailDestinationConfig } from '../../../shared/model/types/data-mart-report';
import { ReportFormActions } from '../shared/ReportFormActions';
import { ReportColumnPicker } from '../../../../edit/components/ReportColumnPicker/ReportColumnPicker';
import { GeneratedSqlViewer } from '../../../../edit/components/ReportColumnPicker/GeneratedSqlViewer';

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
    insightTemplateId?: string;
    templateSourceType?: TemplateSourceTypeEnum;
  };
  allowedDestinationTypes?: DataDestinationType[];
  isInsightContext?: boolean;
  isReadOnly?: boolean;
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
      mode,
      onDirtyChange,
      onFormErrorChange,
      onSubmit,
      onCancel,
      preSelectedDestination,
      prefill,
      allowedDestinationTypes,
      isInsightContext = false,
      isReadOnly = false,
    },
    ref
  ) => {
    const formId = 'email-report-edit-form';
    const navigate = useNavigate();
    const { scope } = useProjectRoute();
    const { dataMart } = useDataMartContext();
    const scheduleRef = useRef<ReportSchedulesInlineListHandle | null>(null);
    const runAfterSaveRef = useRef(false);
    const [triggersDirty, setTriggersDirty] = useState(false);
    const [hasBlendedSelection, setHasBlendedSelection] = useState(false);
    const [isCreatingInsight, setIsCreatingInsight] = useState(false);
    const [useInsightTemplateMode, setUseInsightTemplateMode] = useState(isInsightContext);
    const [isDestinationSelectOpen, setIsDestinationSelectOpen] = useState(false);
    const lastCustomMessageRef = useRef<string>('');
    const { runReport } = useReport();

    useEffect(() => {
      if (isInsightContext && mode === ReportFormMode.CREATE) {
        const timer = setTimeout(() => {
          setIsDestinationSelectOpen(true);
        }, 500);
        return () => {
          clearTimeout(timer);
        };
      }
    }, [isInsightContext, mode]);

    const { data: insightTemplates = [], isLoading: loadingInsightTemplates } = useInsightTemplates(
      dataMart?.id ?? ''
    );

    useEffect(() => {
      if (isInsightContext) {
        setUseInsightTemplateMode(true);
      }
    }, [isInsightContext]);

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
        if (isEmailDestinationConfig(initialReport.destinationConfig)) {
          const hasInsightTemplate =
            initialReport.destinationConfig.templateSource.type ===
            TemplateSourceTypeEnum.INSIGHT_TEMPLATE;
          setUseInsightTemplateMode(hasInsightTemplate);
        }
      } else if (mode === ReportFormMode.CREATE) {
        const destinationId = preSelectedDestination?.id ?? '';
        const templateSourceType =
          prefill?.templateSourceType ??
          (isInsightContext
            ? TemplateSourceTypeEnum.INSIGHT_TEMPLATE
            : TemplateSourceTypeEnum.CUSTOM_MESSAGE);
        const hasInsightTemplate = templateSourceType === TemplateSourceTypeEnum.INSIGHT_TEMPLATE;
        setUseInsightTemplateMode(hasInsightTemplate);
        reset({
          title: prefill?.title ?? '',
          dataDestinationId: destinationId,
          reportCondition: ReportConditionEnum.ALWAYS,
          subject: prefill?.subject ?? '',
          messageTemplate: prefill?.messageTemplate ?? '',
          insightTemplateId: prefill?.insightTemplateId,
          templateSourceType,
          columnConfig: null,
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
      prefill?.insightTemplateId,
      prefill?.templateSourceType,
      isInsightContext,
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
    const messageTemplate = form.watch('messageTemplate') ?? '';
    const templateSourceType = form.watch('templateSourceType');

    // Remember the last custom message so switching tabs doesn't lose content
    useEffect(() => {
      if (templateSourceType === TemplateSourceTypeEnum.CUSTOM_MESSAGE) {
        lastCustomMessageRef.current = messageTemplate;
      }
    }, [templateSourceType, messageTemplate]);

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

    const handleCreateInsight = async () => {
      if (!dataMart?.id) return;
      try {
        setIsCreatingInsight(true);
        const newInsight = await insightTemplatesService.createInsightTemplate(dataMart.id, {
          title: 'New Insight',
        });
        void navigate(scope(`/data-marts/${dataMart.id}/insights-v2/${newInsight.id}`));
      } catch (error) {
        console.error('Failed to create insight:', error);
      } finally {
        setIsCreatingInsight(false);
      }
    };

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
                        open={isDestinationSelectOpen}
                        onOpenChange={setIsDestinationSelectOpen}
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
                  name='templateSourceType'
                  render={({ field }) => (
                    <FormItem className='space-y-4'>
                      {!isInsightContext && !isReadOnly ? (
                        <Tabs
                          value={field.value}
                          onValueChange={(value: string) => {
                            const val = value as TemplateSourceTypeEnum;
                            field.onChange(val);
                            setUseInsightTemplateMode(
                              val === TemplateSourceTypeEnum.INSIGHT_TEMPLATE
                            );
                            if (val === TemplateSourceTypeEnum.CUSTOM_MESSAGE) {
                              form.setValue('messageTemplate', lastCustomMessageRef.current, {
                                shouldDirty: true,
                              });
                              form.setValue('insightTemplateId', undefined, {
                                shouldDirty: true,
                              });
                            } else {
                              lastCustomMessageRef.current =
                                form.getValues('messageTemplate') ?? '';
                              form.setValue('messageTemplate', '', {
                                shouldDirty: true,
                              });
                            }
                          }}
                        >
                          <div className='flex items-center justify-between gap-4'>
                            <FormLabel className='mt-0!'>Message</FormLabel>
                            <TabsList className='grid grid-cols-2'>
                              <TabsTrigger value={TemplateSourceTypeEnum.CUSTOM_MESSAGE}>
                                Custom
                              </TabsTrigger>
                              <TabsTrigger value={TemplateSourceTypeEnum.INSIGHT_TEMPLATE}>
                                Insight
                              </TabsTrigger>
                            </TabsList>
                          </div>

                          <TabsContent
                            value={TemplateSourceTypeEnum.CUSTOM_MESSAGE}
                            className='mt-1'
                          >
                            <div className='flex items-stretch overflow-hidden rounded-md border'>
                              <div className='flex-1 border-r'>
                                {messageTab === 'markdown' ? (
                                  <InsightsProvider>
                                    <InsightTemplateEditor
                                      value={form.watch('messageTemplate') ?? ''}
                                      onChange={(v: string) => {
                                        form.setValue('messageTemplate', v, { shouldDirty: true });
                                      }}
                                      height={240}
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
                              <div className='bg-muted/30 flex flex-col justify-start border-l'>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant='ghost'
                                        size='icon'
                                        type='button'
                                        onClick={() => {
                                          setMessageTab('markdown');
                                        }}
                                        className={cn(
                                          'h-10 w-10 shrink-0 rounded-none transition-colors',
                                          messageTab === 'markdown'
                                            ? 'bg-background shadow-xs'
                                            : 'text-muted-foreground hover:bg-muted/50'
                                        )}
                                      >
                                        <Edit2 className='size-4' />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side='left'>Edit</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <div className='border-t' />
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant='ghost'
                                        size='icon'
                                        type='button'
                                        onClick={() => {
                                          setMessageTab('preview');
                                        }}
                                        className={cn(
                                          'h-10 w-10 shrink-0 rounded-none transition-colors',
                                          messageTab === 'preview'
                                            ? 'bg-background shadow-xs'
                                            : 'text-muted-foreground hover:bg-muted/50'
                                        )}
                                      >
                                        <Eye className='size-4' />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side='left'>Preview</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                            <FormDescription className='mt-4'>
                              <MessageTemplateDescription
                                type={TemplateSourceTypeEnum.CUSTOM_MESSAGE}
                              />
                            </FormDescription>
                          </TabsContent>

                          <TabsContent
                            value={TemplateSourceTypeEnum.INSIGHT_TEMPLATE}
                            className='mt-1 space-y-4'
                          >
                            {insightTemplates.length === 0 && !loadingInsightTemplates ? (
                              <div className='flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center'>
                                <div className='bg-muted mb-3 flex h-12 w-12 items-center justify-center rounded-full'>
                                  <Sparkles className='text-muted-foreground h-6 w-6' />
                                </div>
                                <h3 className='text-sm font-semibold'>No Insights</h3>
                                <p className='text-muted-foreground mt-1 mb-4 max-w-[240px] text-xs'>
                                  Create an Insight to use it as a source for your report messages
                                </p>
                                <div className='flex gap-2'>
                                  <Button
                                    variant='outline'
                                    size='sm'
                                    onClick={() => {
                                      void handleCreateInsight();
                                    }}
                                    disabled={isCreatingInsight}
                                  >
                                    <Plus className='mr-2 h-3.5 w-3.5' />
                                    Create Insight
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <FormField
                                  control={form.control}
                                  name='insightTemplateId'
                                  render={({ field: insightField }) => (
                                    <div className='flex items-center gap-2'>
                                      <Select
                                        value={insightField.value}
                                        onValueChange={insightField.onChange}
                                        disabled={loadingInsightTemplates}
                                      >
                                        <FormControl>
                                          <SelectTrigger className='w-full max-w-full overflow-hidden'>
                                            <SelectValue placeholder='Select an insight'>
                                              <span className='block truncate'>
                                                {insightField.value
                                                  ? insightTemplates.find(
                                                      t => t.id === insightField.value
                                                    )?.title
                                                  : 'Select an insight'}
                                              </span>
                                            </SelectValue>
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className='max-w-[calc(var(--radix-select-trigger-width)+2px)]'>
                                          {insightTemplates.map(template => (
                                            <SelectItem key={template.id} value={template.id}>
                                              <span className='line-clamp-2 block pr-1 text-sm font-medium whitespace-normal'>
                                                {template.title}
                                              </span>
                                            </SelectItem>
                                          ))}
                                          {insightTemplates.length === 0 &&
                                            !loadingInsightTemplates && (
                                              <div className='text-muted-foreground p-2 text-sm'>
                                                No insight available
                                              </div>
                                            )}
                                        </SelectContent>
                                      </Select>
                                      {insightField.value && dataMart && (
                                        <Link
                                          to={scope(
                                            `/data-marts/${dataMart.id}/insights-v2/${insightField.value}`
                                          )}
                                          target='_blank'
                                          title='Open Insight'
                                          className='text-muted-foreground hover:text-primary shrink-0 p-1.5 transition-colors'
                                        >
                                          <ExternalLink className='h-4 w-4' />
                                        </Link>
                                      )}
                                    </div>
                                  )}
                                />
                                <FormDescription>
                                  <MessageTemplateDescription
                                    type={TemplateSourceTypeEnum.INSIGHT_TEMPLATE}
                                  />
                                </FormDescription>
                                <FormMessage />
                              </>
                            )}
                          </TabsContent>
                        </Tabs>
                      ) : (
                        <Tabs
                          className='space-y-4'
                          value={
                            useInsightTemplateMode
                              ? TemplateSourceTypeEnum.INSIGHT_TEMPLATE
                              : TemplateSourceTypeEnum.CUSTOM_MESSAGE
                          }
                        >
                          <div className='mb-0! flex items-center justify-between gap-4'>
                            <FormLabel className='mt-0!'>Message</FormLabel>
                            <TabsList className='grid grid-cols-1'>
                              <TabsTrigger value={TemplateSourceTypeEnum.INSIGHT_TEMPLATE} disabled>
                                Insight
                              </TabsTrigger>
                            </TabsList>
                          </div>
                          <div className='flex items-stretch overflow-hidden rounded-md border'>
                            <div className='flex-1 border-r'>
                              {useInsightTemplateMode ? (
                                <div className='bg-muted/30 p-4'>
                                  <div className='flex items-start justify-between gap-4'>
                                    <div className='min-w-0 flex-1'>
                                      <div className='flex min-w-0 items-center gap-2'>
                                        <p className='min-w-0 flex-1 text-sm leading-relaxed font-semibold'>
                                          {form.watch('insightTemplateId')
                                            ? (insightTemplates.find(
                                                t => t.id === form.watch('insightTemplateId')
                                              )?.title ?? 'Selected Insight')
                                            : 'No Insight selected'}
                                        </p>
                                        {!isInsightContext &&
                                          dataMart &&
                                          form.watch('insightTemplateId') && (
                                            <Link
                                              to={scope(
                                                `/data-marts/${dataMart.id}/insights-v2/${String(form.watch('insightTemplateId'))}`
                                              )}
                                              target='_blank'
                                              title='Open Insight'
                                              className='text-muted-foreground hover:text-primary shrink-0 transition-colors'
                                            >
                                              <ExternalLink className='h-3.5 w-3.5' />
                                            </Link>
                                          )}
                                      </div>
                                      <p className='text-muted-foreground mt-1 text-xs'>
                                        The Insight will be used when the report runs
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {messageTab === 'markdown' ? (
                                    <InsightsProvider>
                                      <InsightTemplateEditor
                                        value={form.watch('messageTemplate') ?? ''}
                                        onChange={(): void => undefined}
                                        height={240}
                                        readOnly
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
                                </>
                              )}
                            </div>
                            {!useInsightTemplateMode && (
                              <div className='bg-muted/30 flex flex-col justify-start border-l'>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant='ghost'
                                        size='icon'
                                        type='button'
                                        onClick={() => {
                                          setMessageTab('markdown');
                                        }}
                                        className={cn(
                                          'h-10 w-10 shrink-0 rounded-none transition-colors',
                                          messageTab === 'markdown'
                                            ? 'bg-background shadow-xs'
                                            : 'text-muted-foreground hover:bg-muted/50'
                                        )}
                                      >
                                        <FileCode className='size-4' />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side='left'>View Source</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <div className='border-t' />
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant='ghost'
                                        size='icon'
                                        type='button'
                                        onClick={() => {
                                          setMessageTab('preview');
                                        }}
                                        className={cn(
                                          'h-10 w-10 shrink-0 rounded-none transition-colors',
                                          messageTab === 'preview'
                                            ? 'bg-background shadow-xs'
                                            : 'text-muted-foreground hover:bg-muted/50'
                                        )}
                                      >
                                        <Eye className='size-4' />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side='left'>Preview</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            )}
                          </div>
                          <FormDescription>
                            <MessageTemplateDescription
                              type={
                                useInsightTemplateMode
                                  ? TemplateSourceTypeEnum.INSIGHT_TEMPLATE
                                  : TemplateSourceTypeEnum.CUSTOM_MESSAGE
                              }
                            />
                          </FormDescription>
                        </Tabs>
                      )}
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

              <FormSection title='Columns' tooltip='Select which columns to include in the report'>
                {dataMart?.id && (
                  <div className='border-border space-y-3 rounded-md border-b bg-white px-4 py-3 dark:border-transparent dark:bg-white/4'>
                    <ReportColumnPicker
                      dataMartId={dataMart.id}
                      value={form.watch('columnConfig')}
                      onChange={value => {
                        form.setValue('columnConfig', value, { shouldDirty: true });
                      }}
                      onBlendedSelectionChange={setHasBlendedSelection}
                    />
                    {hasBlendedSelection && mode === ReportFormMode.EDIT && initialReport?.id && (
                      <div className='pt-1'>
                        <GeneratedSqlViewer reportId={initialReport.id} />
                      </div>
                    )}
                  </div>
                )}
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
              runAfterSaveRef={runAfterSaveRef}
              onSubmit={() => void form.handleSubmit(handleFormSubmit)()}
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
