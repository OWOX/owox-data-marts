import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ResizableColumns from '../../../../shared/components/ResizableColumns/ResizableColumns';
import InsightEditor from '../../../../features/data-marts/insights/components/InsightEditor.tsx';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@owox/ui/components/breadcrumb';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Button } from '@owox/ui/components/button';
import { MoreVertical, Trash2, Sparkles, Loader2, Send, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useClipboard } from '../../../../hooks/useClipboard';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { useInsightForm, useInsightExecutionPolling } from '../hooks';
import { useDataMartContext } from '../../edit/model';
import {
  useMarkdownPreview,
  MarkdownEditorPreview,
} from '../../../../shared/components/MarkdownEditor';
import { useInsights } from '../model';
import { EmailReportEditSheet } from '../../reports/edit';
import { ReportFormMode } from '../../reports/shared';
import { DataDestinationType } from '../../../data-destination';
import { InsightLoader } from './InsightMinerLoader.tsx';
import RelativeTime from '@owox/ui/components/common/relative-time';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { formatDateShort } from '../../../../utils';

export default function InsightDetailsView() {
  const navigate = useNavigate();
  const { insightId } = useParams<{ insightId: string }>();
  const storageKey = useMemo(() => 'insight_details_split', []);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { dataMart } = useDataMartContext();

  const {
    activeInsight: insight,
    insightLoading,
    isRunning,
    triggerId,
    updateInsight,
    updateInsightTitle,
    getInsight,
    runInsight,
    deleteInsight,
    resetTriggerId,
    ensureActiveRunPolling,
  } = useInsights();

  const {
    handleSubmit,
    setValue,
    isTemplateDirty,
    isSubmitting,
    titleValue,
    templateValue,
    handleTitleUpdate,
    onSubmit,
  } = useInsightForm(insight, updateInsight, updateInsightTitle);

  const preview = useMarkdownPreview({
    markdown: insight?.output ?? '',
    enabled: !!insight?.output,
    debounceMs: 0,
  });

  // TODO:: Remove this toggle to show raw markdown output in read-only editor instead of HTML preview
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);

  const { copyToClipboard } = useClipboard();

  const handleCopyOutput = useCallback(async () => {
    const text = insight?.output ?? '';
    if (!text) return;
    const ok = await copyToClipboard(text, 'insight-output');
    if (ok) {
      toast.success('Markdown copied to clipboard');
    } else {
      toast.error('Failed to copy to clipboard');
    }
  }, [insight?.output, copyToClipboard]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        setShowRawOutput(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleDelete = useCallback(async () => {
    if (!insight) return;
    await deleteInsight(insight.id);
    void navigate('..');
  }, [insight, deleteInsight, navigate]);

  const isOutputEmpty = !insightLoading && !insight?.output;

  useEffect(() => {
    if (!insightId) return;
    void getInsight(insightId);
  }, [insightId, getInsight]);

  useEffect(() => {
    if (insight?.id) {
      void ensureActiveRunPolling();
    }
  }, [insight?.id, ensureActiveRunPolling]);

  useInsightExecutionPolling({
    triggerId,
    dataMartId: dataMart?.id ?? '',
    insightId: insight?.id ?? '',
    onRunFinished: useCallback(() => {
      resetTriggerId();
      if (insight?.id) {
        void getInsight(insight.id);
      }
    }, [insight?.id, getInsight, resetTriggerId]),
    onError: useCallback(() => {
      resetTriggerId();
    }, [resetTriggerId]),
  });

  const handleRun = useCallback(async () => {
    if (!insight?.id) {
      console.error('Insight ID is not available');
      return;
    }
    try {
      await runInsight(insight.id);
    } catch (error) {
      console.error('Failed to run insight');
      throw error;
    }
  }, [insight?.id, runInsight]);

  const handleSaveAndRun = useCallback(
    () =>
      handleSubmit(async values => {
        await onSubmit(values);
        if (!insight?.id) {
          console.error('Insight ID is not available');
          return;
        }
        try {
          await runInsight(insight.id);
        } catch (error) {
          console.error('Failed to run insight');
          throw error;
        }
      })(),
    [handleSubmit, insight?.id, onSubmit, runInsight]
  );

  if (insightLoading) {
    // TODO:: Add skeleton loading indicator
    return <div className='text-muted-foreground flex flex-col gap-2 text-sm'>Loading...</div>;
  }

  if (!insight || !dataMart) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Sparkles />
          </EmptyMedia>
        </EmptyHeader>
        <EmptyTitle>Insight not found</EmptyTitle>
        <EmptyDescription>
          The insight you're looking for doesn't exist or couldn't be loaded
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className='flex h-full w-full flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to='..'>Insights</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span aria-current='page' className='block max-w-[480px] truncate'>
                <InlineEditTitle
                  title={titleValue || 'Untitled insight'}
                  onUpdate={handleTitleUpdate}
                  className='font-medium'
                  errorMessage='Title cannot be empty'
                  minWidth='200px'
                />
              </span>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex items-center gap-2'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='Insight actions'>
                <MoreVertical className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                onClick={() => {
                  setIsDeleteOpen(true);
                }}
                className='text-destructive'
              >
                <Trash2 className='h-4 w-4 text-red-600' />{' '}
                <span className='text-red-600'>Delete insight</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className='bg-background flex-1 rounded-md border'>
        <ResizableColumns
          storageKey={storageKey}
          initialRatio={0.5}
          left={
            <div className='flex h-full min-h-0 flex-col'>
              <div className='min-h-0 flex-1 overflow-hidden'>
                <InsightEditor
                  value={templateValue ?? ''}
                  onChange={v => {
                    setValue('template', v, { shouldDirty: true });
                  }}
                  height={'calc(100vh - 275px)'}
                  placeholder='Type / to view available commands...'
                  readOnly={isRunning}
                />
              </div>
              <div className='flex items-center justify-between gap-4 border-t px-4 py-2'>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='default'
                    size='default'
                    disabled={isSubmitting || isRunning}
                    onClick={() => void (isTemplateDirty ? handleSaveAndRun() : handleRun())}
                  >
                    {isRunning ? (
                      <span className='inline-flex items-center gap-2'>
                        <Loader2 className='h-3 w-3 animate-spin' /> Running…
                      </span>
                    ) : isTemplateDirty ? (
                      <span className='inline-flex items-center gap-2'>
                        <Sparkles /> Save & Run Insight
                      </span>
                    ) : (
                      <span className='inline-flex items-center gap-2'>
                        <Sparkles /> Run Insight
                      </span>
                    )}
                  </Button>
                  <Tooltip delayDuration={1500}>
                    <TooltipTrigger asChild>
                      <Button
                        variant='outline'
                        size='default'
                        onClick={() => {
                          setIsReportSheetOpen(true);
                        }}
                        className='gap-2'
                      >
                        <Send className='text-muted-foreground h-4 w-4' />
                        Send & Schedule ...
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                      <p>
                        You can schedule this insight to run at a specific time or send it to a
                        recipient
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {insight.outputUpdatedAt && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className='text-muted-foreground/75 text-sm'>
                          <RelativeTime date={insight.outputUpdatedAt} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side='top'>
                        <p>Last run: {formatDateShort(insight.outputUpdatedAt)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          }
          right={
            <div className='h-full'>
              {isRunning ? (
                <InsightLoader />
              ) : isOutputEmpty ? (
                <Empty className='h-full'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <Sparkles />
                    </EmptyMedia>
                    <EmptyTitle>Even data needs a little spark</EmptyTitle>
                    <EmptyDescription>
                      Write prompt to&nbsp;uncover the story behind your data!
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='flex h-full min-h-0 flex-col gap-2'>
                  <div className='relative min-h-0 flex-1 overflow-hidden'>
                    {showRawOutput ? (
                      <InsightEditor
                        value={insight.output ?? ''}
                        onChange={() => {
                          // TODO:: Dont allow editing output in read-only mode. After rollout Insights feature should be removed
                        }}
                        height={'100%'}
                        className='h-full'
                        readOnly
                      />
                    ) : preview.error ? (
                      <div className='text-destructive'>{preview.error}</div>
                    ) : (
                      <>
                        <MarkdownEditorPreview
                          html={preview.html}
                          loading={preview.loading}
                          error={preview.error}
                          height='100%'
                        />
                        {!!insight.output && !preview.loading && !preview.error && (
                          <div className='absolute top-2 right-2 z-10'>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant='outline'
                                    size='icon'
                                    className='h-8 w-8'
                                    aria-label='Copy markdown to clipboard'
                                    onClick={() => void handleCopyOutput()}
                                  >
                                    <Copy className='h-4 w-4' />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side='left'>
                                  <p>Copy markdown to clipboard</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          }
        />
      </div>

      <ConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title='Delete Insight'
        description='Are you sure you want to delete this insight? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void handleDelete();
        }}
      />

      <EmailReportEditSheet
        isOpen={isReportSheetOpen}
        onClose={() => {
          setIsReportSheetOpen(false);
        }}
        mode={ReportFormMode.CREATE}
        preSelectedDestination={null}
        prefill={{
          title: insight.title || titleValue || 'New report',
          subject: `Insight: ${insight.title || titleValue || ''}`.trim(),
          messageTemplate: templateValue ?? '',
        }}
        allowedDestinationTypes={[
          DataDestinationType.EMAIL,
          DataDestinationType.SLACK,
          DataDestinationType.MS_TEAMS,
          DataDestinationType.GOOGLE_CHAT,
        ]}
      />
    </div>
  );
}
