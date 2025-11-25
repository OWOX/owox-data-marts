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
import { MoreVertical, Trash2, BarChart3, Loader2 } from 'lucide-react';
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
import { DataMartRunStatus } from '../../shared';
import {
  useMarkdownPreview,
  MarkdownEditorPreview,
} from '../../../../shared/components/MarkdownEditor';
import { useInsights } from '../model';

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
    setTriggerId,
    resetTriggerId,
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
    markdown: insight?.template ?? '',
    enabled: Boolean(insight?.output && insight?.lastRun?.status === DataMartRunStatus.SUCCESS),
    debounceMs: 0,
  });

  const handleDelete = useCallback(async () => {
    if (!insight) return;
    await deleteInsight(insight.id);
    navigate('..');
  }, [insight, deleteInsight, navigate]);

  const isOutputEmpty = !insightLoading && !insight?.output;

  useEffect(() => {
    if (!insightId) return;
    void getInsight(insightId);
  }, [insightId, getInsight]);

  useEffect(() => {
    if (insight?.lastRun?.status === DataMartRunStatus.RUNNING && insight.lastRun.id) {
      setTriggerId(insight.lastRun.id);
    }
  }, [insight?.lastRun?.id, insight?.lastRun?.status]);

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
    } catch (_) {
      console.error('Failed to run insight');
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
        } catch (_) {
          console.error('Failed to run insight');
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
            <BarChart3 />
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
              <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className='text-destructive'>
                <Trash2 className='mr-2 h-4 w-4 text-red-600' />{' '}
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
            <div className='h-full p-2'>
              <InsightEditor
                value={templateValue ?? ''}
                onChange={v => setValue('template', v, { shouldDirty: true })}
                height={'calc(100vh - 275px)'}
                placeholder='Type / to view available commands...'
                readOnly={isRunning}
              />
            </div>
          }
          right={
            <div className='h-full p-2'>
              {isRunning ? (
                <div className='text-muted-foreground flex h-full flex-col items-center justify-center gap-2'>
                  <Loader2 className='h-5 w-5 animate-spin' />
                  <div className='text-sm'>
                    Insight is running. Preview will appear once it finishes…
                  </div>
                </div>
              ) : isOutputEmpty ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <BarChart3 />
                    </EmptyMedia>
                    <EmptyTitle>No result yet</EmptyTitle>
                    <EmptyDescription>
                      The preview of your insight will appear here once it is executed
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='flex h-full flex-col gap-2'>
                  {preview.error ? (
                    <div className='text-destructive'>{preview.error}</div>
                  ) : (
                    <MarkdownEditorPreview
                      html={preview.html}
                      loading={preview.loading}
                      error={preview.error}
                      height='100%'
                    />
                  )}
                  <div className='text-muted-foreground border-border flex items-center justify-between border-t pt-2 text-sm'>
                    <div>
                      Updated at:{' '}
                      {insight?.outputUpdatedAt
                        ? new Date(insight.outputUpdatedAt).toLocaleString()
                        : '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          }
        />
      </div>
      <div className='flex justify-start gap-2'>
        <Button
          variant='default'
          size='default'
          disabled={isSubmitting || isRunning}
          onClick={isTemplateDirty ? handleSaveAndRun : handleRun}
        >
          {isRunning ? (
            <span className='inline-flex items-center gap-1'>
              <Loader2 className='h-3 w-3 animate-spin' /> Running…
            </span>
          ) : isTemplateDirty ? (
            'Save & Run'
          ) : (
            'Run'
          )}
        </Button>
      </div>
      <ConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title='Delete Insight'
        description='Are you sure you want to delete this insight? This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => handleDelete()}
      />
    </div>
  );
}
