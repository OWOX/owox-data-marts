import { useState, useRef, useEffect } from 'react';
import { Editor, type OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { useForm } from 'react-hook-form';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import {
  Table as TableComponent,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import {
  Plus,
  Trash2,
  Pencil,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  MoreVertical,
  Table as TableIcon,
  Copy,
  Grid2x2Plus,
  Database,
  CheckCircle,
  XCircle,
  CodeIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@owox/ui/components/tooltip';
import { toast } from 'react-hot-toast';
import { trackEvent } from '../../../../utils';
import { cn } from '@owox/ui/lib/utils';
import {
  AppForm,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormLayout,
  FormActions,
} from '@owox/ui/components/form';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { useSqlDryRunTrigger } from '../../shared/hooks/useSqlDryRunTrigger';
import { formatBytes } from '../../../../utils';

import {
  useInsightTemplateSources,
  useCreateInsightTemplateSource,
  useUpdateInsightTemplateSource,
  useDeleteInsightTemplateSource,
  useInsightTemplateSourceSqlPreviewTrigger,
  type InsightTemplateSourceEntity,
  type InsightArtifactSqlPreviewTriggerResponseDto,
} from '../model';

interface InsightSourcesPanelProps {
  dataMartId: string;
  insightId: string;
  canEdit: boolean;
  isRunning: boolean;
  saving: boolean;
  onInsertTemplate?: (key: string) => void;
}

const MAX_ARTIFACTS = 5;

export function InsightSourcesPanel({
  dataMartId,
  insightId,
  canEdit,
  isRunning,
  onInsertTemplate,
}: InsightSourcesPanelProps) {
  const { data: sources = [], isLoading } = useInsightTemplateSources(dataMartId, insightId);
  const { mutateAsync: createSource, isPending: isCreating } = useCreateInsightTemplateSource(
    dataMartId,
    insightId
  );
  const { mutateAsync: updateSource, isPending: isUpdating } = useUpdateInsightTemplateSource(
    dataMartId,
    insightId
  );
  const { mutateAsync: deleteSource } = useDeleteInsightTemplateSource(dataMartId, insightId);

  const [editingSource, setEditingSource] = useState<InsightTemplateSourceEntity | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<InsightTemplateSourceEntity | null>(null);

  const handleEdit = (source: InsightTemplateSourceEntity) => {
    setEditingSource(source);
    setIsSheetOpen(true);
  };

  const handleAdd = () => {
    setEditingSource(null);
    setIsSheetOpen(true);
  };

  const handleDelete = async (source: InsightTemplateSourceEntity) => {
    try {
      await deleteSource(source.id);
      trackEvent({
        event: 'data_artifact_deleted',
        category: 'Insights',
        action: 'Delete Data Artifact',
        label: source.id,
        context: `${dataMartId}:${insightId}`,
        details: source.key,
      });
      toast.success('Data Artifact deleted');
    } catch {
      trackEvent({
        event: 'data_artifact_error',
        category: 'Insights',
        action: 'DeleteDataArtifactError',
        label: source.id,
        context: `${dataMartId}:${insightId}`,
      });
      toast.error('Failed to delete data artifact');
    } finally {
      setSourceToDelete(null);
    }
  };

  const isLimitReached = sources.length >= MAX_ARTIFACTS;

  return (
    <div className='flex h-full flex-col'>
      {(sources.length > 0 || isLoading) && (
        <div className='flex items-center justify-between px-3 pt-3 pb-2'>
          <h3 className='text-sm font-medium'>
            Data Artifacts ({sources.length}/{MAX_ARTIFACTS})
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={handleAdd}
                  disabled={!canEdit || isRunning || isLimitReached}
                >
                  <Plus className='h-4 w-4' />
                  Data Artifact
                </Button>
              </span>
            </TooltipTrigger>
            {isLimitReached && (
              <TooltipContent>
                Maximum limit of {MAX_ARTIFACTS} data artifacts reached
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      )}

      <div className='flex-1 overflow-auto'>
        {isLoading ? (
          <div className='flex h-full items-center justify-center'>
            <Loader2 className='text-muted-foreground h-6 w-6 animate-spin' />
          </div>
        ) : sources.length === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-3 px-6 py-4 text-center'>
            <div className='bg-muted flex h-10 w-10 items-center justify-center rounded-full'>
              <CodeIcon className='text-muted-foreground h-5 w-5' />
            </div>
            <div className='space-y-1'>
              <p className='text-sm font-medium'>No data artifacts yet</p>
              <p className='text-muted-foreground text-xs'>
                Data Artifacts are SQL queries that fetch data from your Data Mart
              </p>
            </div>
            <Button
              size='sm'
              variant='outline'
              onClick={handleAdd}
              disabled={!canEdit || isRunning}
            >
              <Plus className='mr-2 h-4 w-4' />
              Data Artifact
            </Button>
          </div>
        ) : (
          <div className='px-3 py-2'>
            <div className='overflow-hidden rounded-md border'>
              <TableComponent>
                <TableHeader>
                  <TableRow className='bg-muted/60 hover:bg-muted/60'>
                    <TableHead className='text-xs font-semibold'>
                      <div className='flex items-center gap-1.5'>
                        Id
                        <Tooltip delayDuration={700}>
                          <TooltipTrigger asChild>
                            <Info className='text-muted-foreground/60 h-3.5 w-3.5' />
                          </TooltipTrigger>
                          <TooltipContent side='bottom' align='start' className='max-w-xs'>
                            The id of the data artifact, which is used as a unique identifier in the
                            template. This field cannot be changed after creation.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className='text-xs font-semibold'>Title</TableHead>
                    <TableHead className='w-[80px]' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source: InsightTemplateSourceEntity) => (
                    <TableRow
                      key={source.id}
                      className='hover:bg-muted/30 cursor-pointer select-none'
                      onClick={() => {
                        handleEdit(source);
                      }}
                    >
                      <TableCell className='group font-mono text-xs'>
                        <div className='flex items-center gap-2'>
                          {source.key}
                          <Tooltip delayDuration={700}>
                            <TooltipTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100'
                                onClick={e => {
                                  e.stopPropagation();
                                  void navigator.clipboard.writeText(source.key);
                                  toast.success('Copied Data Artifact id to clipboard');
                                }}
                              >
                                <Copy className='h-3 w-3' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className='max-w-xs'>
                              Copy the data artifact id to your clipboard
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>{source.title}</TableCell>
                      <TableCell className='text-right'>
                        <div className='flex items-center justify-end gap-1'>
                          {onInsertTemplate && (
                            <Tooltip delayDuration={700}>
                              <TooltipTrigger asChild>
                                <Button
                                  size='icon'
                                  variant='ghost'
                                  className='h-8 w-8'
                                  disabled={!canEdit || isRunning}
                                  onClick={e => {
                                    e.stopPropagation();
                                    onInsertTemplate(source.key);
                                  }}
                                >
                                  <Grid2x2Plus className='h-3.5 w-3.5' />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Insert into template</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip delayDuration={700}>
                            <TooltipTrigger asChild>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-8 w-8'
                                disabled={!canEdit || isRunning}
                                onClick={e => {
                                  e.stopPropagation();
                                  handleEdit(source);
                                }}
                              >
                                <Pencil className='h-3.5 w-3.5' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={e => {
                                e.stopPropagation();
                              }}
                            >
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-8 w-8'
                                disabled={!canEdit || isRunning}
                              >
                                <MoreVertical className='h-4 w-4' />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              <DropdownMenuItem
                                className='text-destructive focus:text-destructive'
                                onClick={() => {
                                  setSourceToDelete(source);
                                }}
                              >
                                <Trash2 className='text-destructive focus:text-destructive mr-2 h-4 w-4' />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableComponent>
            </div>
          </div>
        )}
      </div>

      <SourceEditSheet
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
        }}
        source={editingSource}
        dataMartId={dataMartId}
        onSave={async data => {
          try {
            if (editingSource) {
              const updateData = { title: data.title, sql: data.sql };
              await updateSource({ sourceId: editingSource.id, data: updateData });
              trackEvent({
                event: 'data_artifact_updated',
                category: 'Insights',
                action: 'Update Data Artifact',
                label: editingSource.id,
                context: `${dataMartId}:${insightId}`,
                details: data.key,
              });
            } else {
              const result = await createSource(data);
              trackEvent({
                event: 'data_artifact_created',
                category: 'Insights',
                action: 'Create Data Artifact',
                label: result.templateSourceId,
                context: `${dataMartId}:${insightId}`,
                details: data.key,
              });
            }
            setIsSheetOpen(false);
          } catch (error) {
            trackEvent({
              event: 'data_artifact_error',
              category: 'Insights',
              action: editingSource ? 'UpdateDataArtifactError' : 'CreateDataArtifactError',
              label: editingSource?.id ?? 'new',
              context: `${dataMartId}:${insightId}`,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }}
        isSaving={isCreating || isUpdating}
      />

      <ConfirmationDialog
        open={!!sourceToDelete}
        onOpenChange={() => {
          setSourceToDelete(null);
        }}
        onConfirm={() => {
          if (sourceToDelete) {
            void handleDelete(sourceToDelete);
          }
        }}
        title='Delete Data Artifact'
        description={`Are you sure you want to delete data artifact "${sourceToDelete?.title ?? ''}"? This action cannot be undone.`}
        confirmLabel='Delete'
        variant='destructive'
      />
    </div>
  );
}

interface SqlValidationStatusProps {
  sqlTrimmed: string;
  isLoading: boolean;
  result: { isValid: boolean; error?: string; bytes?: number } | null;
}

function SqlValidationStatus({ sqlTrimmed, isLoading, result }: SqlValidationStatusProps) {
  if (!sqlTrimmed) {
    return <p className='text-destructive text-xs'>SQL query is required</p>;
  }
  if (isLoading) {
    return (
      <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
        <Loader2 className='h-3 w-3 animate-spin' />
        Validating SQL…
      </div>
    );
  }
  if (result?.isValid) {
    return (
      <div className='flex items-center gap-1.5 text-xs text-green-600'>
        <CheckCircle className='h-3 w-3 shrink-0' />
        Valid SQL
        {result.bytes !== undefined && (
          <>
            <span className='text-gray-400'>•</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className='flex items-center gap-1 text-gray-600'>
                  <Database className='h-3 w-3' />
                  <span>{formatBytes(result.bytes)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className='text-xs'>
                  This is an estimated volume and may differ from the actual value
                </p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    );
  }
  if (result?.isValid === false) {
    return (
      <div className='flex items-start gap-1.5 text-xs text-red-600'>
        <XCircle className='mt-px h-3 w-3 shrink-0' />
        <span className='break-all'>{result.error ?? 'Invalid SQL'}</span>
      </div>
    );
  }
  return null;
}

function SqlPreviewTable({ result }: { result: InsightArtifactSqlPreviewTriggerResponseDto }) {
  const columnsData = result.columns;
  const rowsData = result.rows;

  if (!columnsData.length) {
    return (
      <div className='bg-muted/30 flex h-40 items-center justify-center rounded-md border text-xs italic'>
        No columns returned
      </div>
    );
  }

  const renderCellValue = (value: string | number | boolean | null | object) => {
    if (value === null) return <span className='text-muted-foreground italic'>null</span>;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className='bg-muted/30 flex h-60 flex-col rounded-md border'>
      <div className='flex items-center justify-between border-b px-3 py-1.5'>
        <div className='flex items-center gap-2 text-xs font-medium'>
          <TableIcon className='h-3.5 w-3.5' />
          <span>Preview Results ({result.rowCount} rows)</span>
        </div>
      </div>
      <div className='flex-1 overflow-auto'>
        <TableComponent className='border-none'>
          <TableHeader className='bg-muted/50 sticky top-0'>
            <TableRow>
              {columnsData.map((col: string) => (
                <TableHead
                  key={col}
                  className='h-8 px-3 text-[10px] font-bold tracking-wider uppercase'
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsData.map((row, rowIndex: number) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex} className='px-3 py-1.5 text-xs'>
                    {renderCellValue(cell)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </TableComponent>
      </div>
    </div>
  );
}

interface SourceEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  source: InsightTemplateSourceEntity | null;
  dataMartId: string;
  onSave: (data: { key: string; title: string; sql: string }) => Promise<void>;
  isSaving: boolean;
}

function SourceEditSheet({
  isOpen,
  onClose,
  source,
  dataMartId,
  onSave,
  isSaving,
}: SourceEditSheetProps) {
  const { resolvedTheme } = useTheme();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [editorHeight, setEditorHeight] = useState(400);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const isResizingRef = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = editorHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = moveEvent.clientY - resizeStartY.current;
      setEditorHeight(Math.max(200, Math.min(800, resizeStartHeight.current + delta)));
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (isOpen && editorRef.current) {
      // Wait for Sheet animation to finish or start
      const timer = setTimeout(() => {
        editorRef.current?.layout();
      }, 100);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        e.stopPropagation();
        setIsFullScreen(false);
      }
    };

    if (isFullScreen) {
      window.addEventListener('keydown', handleKeyDown, true);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isFullScreen]);

  const handleEditorDidMount: OnMount = editor => {
    editorRef.current = editor;
  };

  const form = useForm({
    mode: 'onChange',
    defaultValues: {
      key: source?.key ?? '',
      title: source?.title ?? 'New Data Artifact',
      sql: source?.sql ?? '',
    },
  });

  const sqlValue = form.watch('sql');
  const keyValue = form.watch('key');
  const sqlTrimmed = sqlValue.trim();

  const preview = useInsightTemplateSourceSqlPreviewTrigger(dataMartId, source?.artifactId ?? '');
  const validation = useSqlDryRunTrigger(dataMartId);

  useEffect(() => {
    if (isOpen) {
      form.reset({
        key: source?.key ?? '',
        title: source?.title ?? 'New Data Artifact',
        sql: source?.sql ?? '',
      });
    }
    preview.reset();
    void validation.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-validate SQL with debounce when it changes
  useEffect(() => {
    if (!isOpen || !sqlTrimmed) {
      void validation.cancel();
      return;
    }
    const timer = setTimeout(() => {
      void validation.validateSql(sqlTrimmed);
    }, 500);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqlTrimmed, isOpen]);

  const isSqlKnownInvalid = validation.result !== null && !validation.result.isValid;
  const canSave =
    !isSaving &&
    sqlTrimmed.length > 0 &&
    keyValue.trim().length > 0 &&
    !Object.keys(form.formState.errors).length &&
    !validation.isLoading &&
    !isSqlKnownInvalid;

  const handleSave = async (data: { key: string; title: string; sql: string }) => {
    try {
      await onSave(data);
      toast.success(source ? 'Data Artifact updated' : 'Data Artifact created');
    } catch {
      toast.error('Failed to save data artifact');
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className='flex flex-col p-0 sm:max-w-xl md:max-w-2xl'>
        <SheetHeader className='px-6 pt-6 pb-4'>
          <SheetTitle>{source ? 'Edit Data Artifact' : 'Add Data Artifact'}</SheetTitle>
          <SheetDescription>Configure the data artifact for your insight.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <AppForm
            onSubmit={event => {
              void form.handleSubmit(handleSave)(event);
            }}
          >
            <FormLayout>
              <FormField
                control={form.control}
                name='key'
                rules={{
                  required: 'Id is required',
                  pattern: {
                    value: /^[a-zA-Z0-9_]+$/,
                    message: 'Only letters, digits, and underscores are allowed',
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel tooltip='Enter a unique id that will be used to reference this source in the insight template. This field cannot be changed after creation.'>
                      Id
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='e.g. active_users' disabled={!!source} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='title'
                rules={{ required: 'Title is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel tooltip='Enter a human-readable title for this data source.'>
                      Title
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='Visible title' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem className='flex-1 overflow-hidden'>
                <div className='flex items-center justify-between'>
                  <FormLabel tooltip='Write the SQL query to fetch data. You can use parameters defined in the template.'>
                    SQL Query
                  </FormLabel>
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        void preview.runPreview(sqlValue);
                      }}
                      disabled={preview.isLoading}
                    >
                      {preview.isLoading ? (
                        <>
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          Preview
                        </>
                      ) : (
                        'Preview'
                      )}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8'
                      onClick={() => {
                        setIsFullScreen(!isFullScreen);
                      }}
                    >
                      {isFullScreen ? (
                        <Minimize2 className='h-4 w-4' />
                      ) : (
                        <Maximize2 className='h-4 w-4' />
                      )}
                    </Button>
                  </div>
                </div>

                <div
                  className={cn(
                    'flex flex-1 flex-col overflow-hidden',
                    isFullScreen && 'bg-background fixed inset-0 z-50 h-full overflow-auto p-4'
                  )}
                  key={isOpen ? 'open' : 'closed'}
                >
                  {isFullScreen && (
                    <div className='mb-4 flex items-center justify-between'>
                      <h3 className='text-lg font-medium'>SQL Editor</h3>
                      <div className='flex gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            void preview.runPreview(sqlValue);
                          }}
                          disabled={preview.isLoading}
                        >
                          {preview.isLoading ? (
                            <>
                              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                              Preview
                            </>
                          ) : (
                            'Preview'
                          )}
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          onClick={() => {
                            setIsFullScreen(false);
                          }}
                        >
                          <Minimize2 className='h-5 w-5' />
                        </Button>
                      </div>
                    </div>
                  )}
                  <div
                    className={cn(
                      'relative flex min-h-[200px] flex-col overflow-hidden rounded-md border',
                      isFullScreen ? 'h-full flex-1' : undefined
                    )}
                    style={isFullScreen ? undefined : { height: editorHeight }}
                  >
                    <Editor
                      key={isFullScreen ? 'full' : 'normal'}
                      height='100%'
                      language='sql'
                      value={sqlValue}
                      onMount={handleEditorDidMount}
                      onChange={v => {
                        form.setValue('sql', v ?? '');
                      }}
                      theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        wordWrap: 'on',
                        stickyScroll: {
                          enabled: true,
                        },
                        fontSize: 12,
                      }}
                    />
                    {!isFullScreen && (
                      <div
                        className='absolute right-0 bottom-0 left-0 z-10 flex h-2.5 cursor-ns-resize items-center justify-center'
                        onMouseDown={handleResizeMouseDown}
                      >
                        <div className='bg-muted-foreground/30 h-0.5 w-10 rounded-full' />
                      </div>
                    )}
                  </div>
                  <div className='mt-2'>
                    <SqlValidationStatus
                      sqlTrimmed={sqlTrimmed}
                      isLoading={validation.isLoading}
                      result={validation.result}
                    />
                  </div>
                  {isFullScreen && (
                    <div className='mt-4 flex shrink-0 flex-col gap-2'>
                      {preview.result && <SqlPreviewTable result={preview.result} />}
                      {preview.error && (
                        <div className='border-destructive/50 bg-destructive/10 text-destructive h-40 shrink-0 overflow-auto rounded-md border p-2 font-mono text-xs'>
                          {preview.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isFullScreen && (
                  <div className='flex shrink-0 flex-col gap-2 overflow-hidden'>
                    {preview.result && <SqlPreviewTable result={preview.result} />}
                    {preview.error && (
                      <div className='border-destructive/50 bg-destructive/10 text-destructive h-40 shrink-0 overflow-auto rounded-md border p-2 font-mono text-xs'>
                        {preview.error}
                      </div>
                    )}
                  </div>
                )}
              </FormItem>
            </FormLayout>

            <FormActions>
              <Button type='submit' disabled={!canSave} className='w-full'>
                {isSaving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {source ? 'Update Data Artifact' : 'Create Data Artifact'}
              </Button>
              <Button type='button' variant='outline' onClick={onClose} className='w-full'>
                Cancel
              </Button>
            </FormActions>
          </AppForm>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
