import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, MoreVertical, Play, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@owox/ui/components/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import ResizableColumns from '../../../../shared/components/ResizableColumns/ResizableColumns';
import { useDataMartContext } from '../../edit/model';
import { DataMartRunStatus, DataMartStatus } from '../../shared';
import { NO_PERMISSION_MESSAGE, usePermissions } from '../../../../app/permissions';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';
import {
  MarkdownEditorPreview,
  useMarkdownPreview,
} from '../../../../shared/components/MarkdownEditor';
import {
  insightTemplatesService,
  mapInsightTemplateFromDto,
  mapToUpdateInsightTemplateRequest,
  type InsightTemplateEntity,
  type InsightTemplateSourceDto,
} from '../model';
import {
  insightArtifactsService,
  mapInsightArtifactListFromDto,
  type InsightArtifactEntity,
} from '../../insight-artifacts';
import type { DataMartRunResponseDto } from '../../shared/types/api';
import { InsightTemplateEditor } from './InsightTemplateEditor';
import { InsightTemplateSourcesBottomPanel } from './InsightTemplateSourcesBottomPanel';

export default function InsightTemplateDetailsView() {
  const navigate = useNavigate();
  const { insightTemplateId } = useParams<{ insightTemplateId: string }>();
  const { dataMart } = useDataMartContext();
  const { canEdit, canDelete } = usePermissions();

  const [entity, setEntity] = useState<InsightTemplateEntity | null>(null);
  const [template, setTemplate] = useState('');
  const [sources, setSources] = useState<InsightTemplateSourceDto[]>([]);
  const [artifacts, setArtifacts] = useState<InsightArtifactEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [triggerId, setTriggerId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [runErrorMessage, setRunErrorMessage] = useState<string | null>(null);

  const preview = useMarkdownPreview({
    markdown: entity?.output ?? '',
    enabled: Boolean(entity?.output),
    debounceMs: 0,
  });

  const isDraft = dataMart?.status.code === DataMartStatus.DRAFT;

  const isDirty = useMemo(() => {
    if (!entity) return false;
    const initialSources = JSON.stringify(entity.sources);
    const currentSources = JSON.stringify(sources);
    return entity.template !== template || initialSources !== currentSources;
  }, [entity, sources, template]);

  const loadEntity = useCallback(async (): Promise<string | null> => {
    if (!dataMart?.id || !insightTemplateId) return null;
    setLoading(true);
    try {
      const [templateDto, artifactsDto] = await Promise.all([
        insightTemplatesService.getInsightTemplateById(dataMart.id, insightTemplateId),
        insightArtifactsService.getInsightArtifacts(dataMart.id),
      ]);

      const mapped = mapInsightTemplateFromDto(templateDto);
      setEntity(mapped);
      setTemplate(mapped.template ?? '');
      setSources(mapped.sources);
      setArtifacts(mapInsightArtifactListFromDto(artifactsDto));
      const runError = extractLatestRunError(templateDto.lastManualDataMartRun);
      setRunErrorMessage(runError);
      return runError;
    } catch {
      toast.error('Failed to load insight template');
      void navigate('..');
      return null;
    } finally {
      setLoading(false);
    }
  }, [dataMart?.id, insightTemplateId, navigate]);

  useEffect(() => {
    void loadEntity();
  }, [loadEntity]);

  useEffect(() => {
    if (!triggerId || !dataMart?.id || !insightTemplateId) return;

    const controller = new AbortController();
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const statusResponse = await insightTemplatesService.checkInsightTemplateExecutionStatus(
            dataMart.id,
            triggerId,
            insightTemplateId,
            {
              skipLoadingIndicator: true,
              signal: controller.signal,
            }
          );

          if (
            [TaskStatus.SUCCESS, TaskStatus.ERROR, TaskStatus.CANCELLED].includes(
              statusResponse.status
            )
          ) {
            window.clearInterval(interval);
            setTriggerId(null);
            setIsRunning(false);

            const runError = await loadEntity();
            if (statusResponse.status === TaskStatus.CANCELLED) {
              toast.error('Template run was cancelled');
            } else if (runError) {
              toast.error('Template run failed');
            } else {
              toast.success('Template run completed');
            }
          }
        } catch {
          window.clearInterval(interval);
          setTriggerId(null);
          setIsRunning(false);
          const message = 'Failed to check template run status';
          setRunErrorMessage(message);
          toast.error(message);
        }
      })();
    }, 2500);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [dataMart?.id, insightTemplateId, loadEntity, triggerId]);

  const handleSave = useCallback(async (): Promise<InsightTemplateEntity | null> => {
    if (!dataMart?.id || !insightTemplateId || !entity || !canEdit) return null;

    setSaving(true);
    try {
      const dto = await insightTemplatesService.updateInsightTemplate(
        dataMart.id,
        insightTemplateId,
        mapToUpdateInsightTemplateRequest({
          title: entity.title,
          template,
          sources,
        })
      );
      const updated = mapInsightTemplateFromDto(dto);
      setEntity(updated);
      setTemplate(updated.template ?? '');
      setSources(updated.sources);
      toast.success('Template saved');
      return updated;
    } catch {
      toast.error('Failed to save template');
      return null;
    } finally {
      setSaving(false);
    }
  }, [canEdit, dataMart?.id, entity, insightTemplateId, sources, template]);

  const handleRun = useCallback(async () => {
    if (!dataMart?.id || !insightTemplateId || isRunning || isDraft) return;
    setRunErrorMessage(null);
    setIsRunning(true);
    try {
      const { triggerId: nextTriggerId } =
        await insightTemplatesService.startInsightTemplateExecution(dataMart.id, insightTemplateId);
      setTriggerId(nextTriggerId);
    } catch {
      setIsRunning(false);
      toast.error('Failed to start template run');
    }
  }, [dataMart?.id, insightTemplateId, isRunning, isDraft]);

  const handleSaveAndRun = useCallback(async () => {
    const saved = await handleSave();
    if (!saved) return;
    await handleRun();
  }, [handleRun, handleSave]);

  const handleDelete = useCallback(async () => {
    if (!dataMart?.id || !insightTemplateId) return;
    try {
      await insightTemplatesService.deleteInsightTemplate(dataMart.id, insightTemplateId);
      toast.success('Template deleted');
      void navigate('..');
    } catch {
      toast.error('Failed to delete template');
    }
  }, [dataMart?.id, insightTemplateId, navigate]);

  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      if (!dataMart?.id || !insightTemplateId) return;

      try {
        const dto = await insightTemplatesService.updateInsightTemplateTitle(
          dataMart.id,
          insightTemplateId,
          newTitle
        );
        const updated = mapInsightTemplateFromDto(dto);
        setEntity(prev => {
          if (!prev) return updated;

          return {
            ...prev,
            title: updated.title,
            modifiedAt: updated.modifiedAt,
          };
        });
        toast.success('Title updated');
      } catch (error) {
        toast.error('Failed to update title');
        throw error;
      }
    },
    [dataMart?.id, insightTemplateId]
  );

  if (loading || !entity || !dataMart) {
    return <div className='text-muted-foreground p-4 text-sm'>Loading template…</div>;
  }

  const sourceKeyDuplicates = new Set<string>();
  const duplicatedKeys = new Set<string>();
  for (const source of sources) {
    const key = source.key.trim();
    if (!key) continue;
    if (sourceKeyDuplicates.has(key)) duplicatedKeys.add(key);
    sourceKeyDuplicates.add(key);
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to='..'>Insight Templates</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span aria-current='page' className='block max-w-[480px] truncate'>
                <InlineEditTitle
                  title={entity.title || 'Untitled template'}
                  onUpdate={handleTitleUpdate}
                  className='font-medium'
                  errorMessage='Title cannot be empty'
                  minWidth='200px'
                  readOnly={!canEdit}
                />
              </span>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' aria-label='Insight template actions'>
              <MoreVertical className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className='w-full'>
                  <DropdownMenuItem
                    onClick={() => {
                      setIsDeleteDialogOpen(true);
                    }}
                    className='text-destructive'
                    disabled={!canDelete}
                  >
                    <Trash2 className='h-4 w-4 text-red-600' />
                    <span className='text-red-600'>Delete template</span>
                  </DropdownMenuItem>
                </div>
              </TooltipTrigger>
              {!canDelete && <TooltipContent side='left'>{NO_PERMISSION_MESSAGE}</TooltipContent>}
            </Tooltip>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className='bg-background flex-1 rounded-md border'>
        <ResizableColumns
          storageKey='insight_template_details_split'
          initialRatio={0.56}
          left={
            <div className='flex h-full min-h-0 flex-col'>
              <div className='relative min-h-[280px] flex-1 overflow-hidden'>
                <InsightTemplateEditor
                  value={template}
                  onChange={setTemplate}
                  readOnly={!canEdit || isRunning || saving}
                  height='calc(100vh - 320px)'
                />
                <InsightTemplateSourcesBottomPanel
                  dataMartId={dataMart.id}
                  insightTemplateId={insightTemplateId}
                  sources={sources}
                  setSources={setSources}
                  artifacts={artifacts}
                  canEdit={canEdit}
                  isRunning={isRunning}
                  saving={saving}
                  duplicatedKeys={duplicatedKeys}
                />
              </div>

              <div className='flex items-center gap-2 border-t px-4 py-2'>
                <div className='flex w-full items-center gap-3'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className='inline-flex'>
                        <Button
                          onClick={() => void (isDirty ? handleSaveAndRun() : handleRun())}
                          disabled={
                            !canEdit || isRunning || saving || isDraft || duplicatedKeys.size > 0
                          }
                        >
                          {isRunning || saving ? (
                            <>
                              <Loader2 className='h-4 w-4 animate-spin' />
                              Running…
                            </>
                          ) : (
                            <>
                              <Play className='h-4 w-4' />
                              {isDirty ? 'Save & Run' : 'Run'}
                            </>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {isDraft && canEdit && (
                      <TooltipContent>Publish Data Mart first to run templates</TooltipContent>
                    )}
                    {!canEdit && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
                  </Tooltip>
                  {runErrorMessage && (
                    <div className='min-w-0 flex-1 text-xs text-red-700'>
                      <p className='truncate' title={`Run failed: ${runErrorMessage}`}>
                        Run failed: {runErrorMessage}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          }
          right={
            <div className='h-full'>
              <div className='flex h-full min-h-0 flex-col gap-2'>
                <div className='relative min-h-0 flex-1 overflow-hidden'>
                  <MarkdownEditorPreview
                    html={preview.html}
                    loading={preview.loading}
                    error={preview.error}
                    height='100%'
                    emptyState={
                      <div className='text-muted-foreground p-3 text-sm'>
                        Run template to see output.
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
          }
        />
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete template'
        description='This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}

function extractLatestRunError(run: DataMartRunResponseDto | null): string | null {
  if (run?.status !== DataMartRunStatus.FAILED) {
    return null;
  }

  const errors = run.errors ?? [];
  if (errors.length === 0) {
    return 'Unknown error';
  }

  const lastError = errors[errors.length - 1];
  const parsedError = extractErrorMessageFromLogLine(lastError);
  if (parsedError) {
    return parsedError;
  }

  return lastError;
}

function extractErrorMessageFromLogLine(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error;
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // raw is not json, return null and use original value.
  }

  return null;
}
