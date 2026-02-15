import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Editor } from '@monaco-editor/react';
import { FileCode2, Loader2, MoreVertical, Play, Trash2 } from 'lucide-react';
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
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';
import {
  MarkdownEditorPreview,
  useMarkdownPreview,
} from '../../../../shared/components/MarkdownEditor';
import ResizableColumns from '../../../../shared/components/ResizableColumns/ResizableColumns';
import SqlValidator from '../../edit/components/SqlValidator/SqlValidator';
import { useDataMartContext } from '../../edit/model';
import { NO_PERMISSION_MESSAGE, usePermissions } from '../../../../app/permissions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  insightArtifactsService,
  mapInsightArtifactFromDto,
  mapToUpdateInsightArtifactRequest,
  type InsightArtifactEntity,
  useInsightArtifactSqlPreviewTrigger,
} from '../model';

interface SqlValidationState {
  isLoading: boolean;
  isValid: boolean | null;
  error: string | null;
  bytes: number | null;
}

export default function InsightArtifactDetailsView() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { insightArtifactId } = useParams<{ insightArtifactId: string }>();
  const { dataMart } = useDataMartContext();
  const { canEdit, canDelete } = usePermissions();

  const [artifact, setArtifact] = useState<InsightArtifactEntity | null>(null);
  const [sql, setSql] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [validationState, setValidationState] = useState<SqlValidationState | null>(null);

  const {
    runPreview,
    isLoading: isPreviewRunning,
    result: previewResult,
    error: previewExecutionError,
    reset: resetPreview,
  } = useInsightArtifactSqlPreviewTrigger(dataMart?.id ?? '', insightArtifactId ?? '');

  const previewMarkdown = useMemo(() => {
    if (!previewResult) return '';

    return buildMarkdownTable(
      previewResult.columns,
      previewResult.rows,
      previewResult.limit,
      previewResult.rowCount
    );
  }, [previewResult]);
  const hasPreviewResult = Boolean(previewResult ?? previewExecutionError);
  const markdownPreview = useMarkdownPreview({
    markdown: previewMarkdown,
    enabled: Boolean(previewResult && !previewExecutionError),
    debounceMs: 0,
  });

  const isDirty = useMemo(() => {
    if (!artifact) return false;
    return artifact.sql !== sql;
  }, [artifact, sql]);

  const loadArtifact = useCallback(async () => {
    if (!dataMart?.id || !insightArtifactId) return;
    setLoading(true);
    try {
      const dto = await insightArtifactsService.getInsightArtifactById(
        dataMart.id,
        insightArtifactId
      );
      const entity = mapInsightArtifactFromDto(dto);
      setArtifact(entity);
      setSql(entity.sql);
      resetPreview();
    } catch {
      toast.error('Failed to load insight artifact');
      void navigate('..');
    } finally {
      setLoading(false);
    }
  }, [dataMart?.id, insightArtifactId, navigate, resetPreview]);

  useEffect(() => {
    void loadArtifact();
  }, [loadArtifact]);

  const handleSave = useCallback(
    async ({
      showToast = true,
    }: { showToast?: boolean } = {}): Promise<InsightArtifactEntity | null> => {
      if (!dataMart?.id || !insightArtifactId || !artifact || !isDirty || saving) return artifact;

      setSaving(true);
      try {
        const dto = await insightArtifactsService.updateInsightArtifact(
          dataMart.id,
          insightArtifactId,
          mapToUpdateInsightArtifactRequest({ title: artifact.title, sql })
        );
        const updated = mapInsightArtifactFromDto(dto);
        setArtifact(updated);
        setSql(updated.sql);
        if (showToast) {
          toast.success('Artifact saved');
        }
        return updated;
      } catch {
        toast.error('Failed to save artifact');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [artifact, dataMart?.id, insightArtifactId, isDirty, saving, sql]
  );

  const handleDelete = useCallback(async () => {
    if (!dataMart?.id || !insightArtifactId) return;
    try {
      await insightArtifactsService.deleteInsightArtifact(dataMart.id, insightArtifactId);
      toast.success('Artifact deleted');
      void navigate('..');
    } catch {
      toast.error('Failed to delete artifact');
    }
  }, [dataMart?.id, insightArtifactId, navigate]);

  const handleValidationStateChange = useCallback((state: SqlValidationState) => {
    setValidationState(prev => {
      if (!prev) return state;

      if (
        prev.isLoading === state.isLoading &&
        prev.isValid === state.isValid &&
        prev.error === state.error &&
        prev.bytes === state.bytes
      ) {
        return prev;
      }

      return state;
    });
  }, []);

  const handleRunSqlPreview = useCallback(async () => {
    if (
      !dataMart?.id ||
      !insightArtifactId ||
      !sql.trim() ||
      isPreviewRunning ||
      saving ||
      !canEdit
    ) {
      return;
    }

    if (isDirty) {
      const saved = await handleSave({ showToast: false });
      if (!saved) return;
    }

    await runPreview(sql.trim());
  }, [
    canEdit,
    dataMart?.id,
    handleSave,
    insightArtifactId,
    isDirty,
    isPreviewRunning,
    runPreview,
    saving,
    sql,
  ]);

  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      if (!dataMart?.id || !insightArtifactId) return;

      try {
        const dto = await insightArtifactsService.updateInsightArtifactTitle(
          dataMart.id,
          insightArtifactId,
          newTitle
        );
        const updated = mapInsightArtifactFromDto(dto);
        setArtifact(prev => {
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
    [dataMart?.id, insightArtifactId]
  );

  if (loading || !artifact || !dataMart) {
    return <div className='text-muted-foreground p-4 text-sm'>Loading artifact…</div>;
  }

  return (
    <div className='flex h-full w-full flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to='..'>Insight Artifacts</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span aria-current='page' className='block max-w-[480px] truncate'>
                <InlineEditTitle
                  title={artifact.title || 'Untitled artifact'}
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
            <Button variant='ghost' size='icon' aria-label='Insight artifact actions'>
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
                    <span className='text-red-600'>Delete artifact</span>
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
          storageKey='insight_artifact_details_split'
          initialRatio={0.5}
          left={
            <div className='flex h-full min-h-0 flex-col'>
              <div className='flex min-h-0 flex-1 flex-col'>
                <div className='flex items-center justify-between border-b px-4 py-2'>
                  <div className='text-sm font-medium'>SQL</div>
                  <div className='text-muted-foreground text-xs'>
                    Status: {artifact.validationStatus}
                  </div>
                </div>
                <Editor
                  className='overflow-hidden'
                  language='sql'
                  value={sql}
                  onChange={value => {
                    setSql(value ?? '');
                  }}
                  height='calc(100vh - 320px)'
                  theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    overviewRulerBorder: false,
                    overviewRulerLanes: 0,
                    readOnly: !canEdit,
                  }}
                />
              </div>

              <div className='border-t px-4 py-2'>
                <div className='flex items-center gap-4'>
                  <div className='flex items-center gap-2'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            onClick={() => void handleRunSqlPreview()}
                            disabled={!canEdit || !sql.trim() || isPreviewRunning || saving}
                          >
                            {isPreviewRunning || saving ? (
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
                      {!canEdit && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
                    </Tooltip>
                  </div>

                  <div className='flex items-center'>
                    <div className='h-6 w-px bg-gray-300'></div>
                    <SqlValidator
                      sql={sql}
                      dataMartId={dataMart.id}
                      onValidationStateChange={handleValidationStateChange}
                    />
                  </div>
                </div>
                {validationState?.isValid === false && validationState.error && (
                  <div className='mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700'>
                    {validationState.error}
                  </div>
                )}
              </div>
            </div>
          }
          right={
            <div className='h-full'>
              <div className='flex h-full min-h-0 flex-col gap-2'>
                <div className='relative min-h-0 flex-1 overflow-hidden'>
                  {previewExecutionError ? (
                    <div className='text-destructive p-3 text-sm'>{previewExecutionError}</div>
                  ) : (
                    <MarkdownEditorPreview
                      html={markdownPreview.html}
                      loading={markdownPreview.loading}
                      error={markdownPreview.error}
                      height='100%'
                      emptyState={
                        <div className='text-muted-foreground p-3 text-sm'>
                          {hasPreviewResult
                            ? 'No rows returned.'
                            : `Run SQL to preview rows as a table.`}
                        </div>
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          }
        />
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title='Delete artifact'
        description='This action cannot be undone.'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void handleDelete();
        }}
      />

      {!canEdit && (
        <div className='text-muted-foreground inline-flex items-center gap-2 text-xs'>
          <FileCode2 className='h-4 w-4' />
          You have read-only access.
        </div>
      )}
    </div>
  );
}

function buildMarkdownTable(
  columns: string[],
  rows: unknown[][],
  limit: number,
  rowCount: number
): string {
  if (columns.length === 0) {
    return `### SQL Preview\n\nShowing up to ${String(limit)} rows.\n\n_No columns returned._`;
  }

  const headerLine = `| ${columns.join(' | ')} |`;
  const separatorLine = `| ${columns.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map(row => {
    const cells = columns.map((_, index) => escapeMarkdownCell(row[index]));
    return `| ${cells.join(' | ')} |`;
  });

  return [
    '### SQL Preview',
    '',
    `Showing up to ${String(limit)} rows. Rows returned: ${String(rowCount)}`,
    '',
    headerLine,
    separatorLine,
    ...bodyLines,
  ].join('\n');
}

function escapeMarkdownCell(value: unknown): string {
  if (value == null) return '';

  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? String(value)
        : value instanceof Date
          ? value.toISOString()
          : typeof value === 'symbol'
            ? value.description
              ? `Symbol(${value.description})`
              : 'Symbol'
            : typeof value === 'function'
              ? '[function]'
              : tryStringifyObject(value);

  return text.replace(/\|/g, '\\|').replace(/\n/g, '<br/>');
}

function tryStringifyObject(value: unknown): string {
  if (typeof value !== 'object' || value == null) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable object]';
  }
}
