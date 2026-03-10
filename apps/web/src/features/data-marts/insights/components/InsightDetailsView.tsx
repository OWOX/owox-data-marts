import type * as monacoEditor from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  FileText,
  History,
  Loader2,
  MessageSquare,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@owox/ui/components/resizable';
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { InlineEditTitle } from '../../../../shared/components/InlineEditTitle/InlineEditTitle.tsx';

import { useDataMartContext } from '../../edit/model';
import {
  DataMartRunStatus,
  DataMartStatus,
  isDataMartRunFinalStatus,
  isTaskFinalStatus,
} from '../../shared';
import { NO_PERMISSION_MESSAGE, usePermissions } from '../../../../app/permissions';
import {
  MarkdownEditorPreview,
  useMarkdownPreview,
} from '../../../../shared/components/MarkdownEditor';
import type { InsightTemplateEntity } from '../model';
import {
  useInsightTemplateSources,
  insightTemplatesService,
  mapInsightTemplateFromDto,
} from '../model';
import { EmailReportEditSheet } from '../../reports/edit';
import { ReportFormMode, ReportsProvider, TemplateSourceTypeEnum } from '../../reports/shared';
import { DataDestinationType, DataDestinationTypeModel } from '../../../data-destination';

import {
  readAiPref,
  readAiSize,
  readPreviewPref,
  readPreviewSize,
  saveAiPref,
  saveAiSize,
  savePreviewPref,
  savePreviewSize,
  readArtifactsPref,
  saveArtifactsPref,
  AI_CONSTANTS,
  PREVIEW_CONSTANTS,
} from '../utils/insight-view-persistence.utils.ts';
import { AiAssistantPanel } from './AiAssistantPanel.tsx';
import { InsightTemplateEditor } from './InsightTemplateEditor';
import { InsightSourcesPanel } from './InsightSourcesPanel';
import { InsightLoader } from './InsightLoader';
import { InsightReportsSheet } from './InsightReportsSheet';
import { useReportsByInsightTemplate } from '../../reports/list/model/hooks/useReportsByInsightTemplate';
import type { AiAssistantPanelHandle } from '../model/ai-assistant/types/ai-assistant-panel.types.ts';
import type { DataMartReport } from '../../reports/shared/model/types/data-mart-report';

export default function InsightDetailsView() {
  const navigate = useNavigate();
  const { insightId } = useParams<{ insightId: string }>();
  const { dataMart } = useDataMartContext();
  const { canEdit, canDelete } = usePermissions();

  const [entity, setEntity] = useState<InsightTemplateEntity | null>(null);
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [triggerId, setTriggerId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [runErrorMessage, setRunErrorMessage] = useState<string | null>(null);
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);
  const [reportToEdit, setReportToEdit] = useState<DataMartReport | undefined>(undefined);
  const [reportFormMode, setReportFormMode] = useState<ReportFormMode>(ReportFormMode.CREATE);

  const [isReportsListOpen, setIsReportsListOpen] = useState(false);
  const [shouldReopenReportsList, setShouldReopenReportsList] = useState(false);

  const { data: reports = [] } = useReportsByInsightTemplate(dataMart?.id ?? '', insightId ?? '');

  const getReportsTooltipText = useCallback((reports: DataMartReport[]) => {
    if (reports.length === 0) return null;

    const types = Array.from(new Set(reports.map(r => r.dataDestination.type)));
    const typeLabels = types.map(type => DataDestinationTypeModel.getInfo(type).displayName);

    const typesString = typeLabels.join(', ');
    return reports.length === 1
      ? `This Insight is used in 1 report (${typesString})`
      : `This Insight is used in ${String(reports.length)} reports (${typesString})`;
  }, []);

  // ── Preview panel ──────────────────────────────────────────────────────────
  // Closed by default; restored from localStorage.
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(readPreviewPref);
  const isSystemPreviewToggle = useRef(false);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const previewDefaultSize = useMemo(
    () => (readPreviewPref() ? PREVIEW_CONSTANTS.COLLAPSED_SIZE : readPreviewSize()),
    []
  );

  // ── AI Assistant panel ─────────────────────────────────────────────────────
  // Open by default; restored from localStorage.
  const [isAiCollapsed, setIsAiCollapsed] = useState(readAiPref);
  const aiPanelRef = useRef<ImperativePanelHandle>(null);
  const aiDefaultSize = useMemo(
    () => (readAiPref() ? AI_CONSTANTS.COLLAPSED_SIZE : readAiSize()),
    []
  );
  // AI Assistant internal state controlled from panel header
  const [isAiHistoryView, setIsAiHistoryView] = useState(false);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const aiAssistantRef = useRef<AiAssistantPanelHandle>(null);

  // ── Copy preview markdown ──────────────────────────────────────────────────
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyMarkdown = useCallback(() => {
    const markdown = entity?.lastRenderedTemplate;
    if (!markdown) return;
    void navigator.clipboard.writeText(markdown).then(() => {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    });
  }, [entity?.lastRenderedTemplate]);

  // ── Artifacts panel handlers ───────────────────────────────────────────────
  const [isArtifactsCollapsed, setIsArtifactsCollapsed] = useState(readArtifactsPref);
  const artifactsPanelRef = useRef<ImperativePanelHandle>(null);
  const artifactsDefaultSize = useMemo(() => (readArtifactsPref() ? 0 : 35), []);
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount = useCallback((editor: monacoEditor.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);

  const handleInsertTemplate = useCallback((key: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    if (!selection) return;
    const text = `{{table source="${key}"}}`;
    editor.executeEdits('insert-template', [{ range: selection, text, forceMoveMarkers: true }]);
    editor.focus();
  }, []);

  // ── Preview panel handlers ─────────────────────────────────────────────────

  const handlePreviewCollapse = useCallback(() => {
    setIsPreviewCollapsed(true);
    if (!isSystemPreviewToggle.current) savePreviewPref(true);
    isSystemPreviewToggle.current = false;
  }, []);

  const handlePreviewExpand = useCallback(() => {
    setIsPreviewCollapsed(false);
    if (!isSystemPreviewToggle.current) savePreviewPref(false);
    isSystemPreviewToggle.current = false;
  }, []);

  const handlePreviewResize = useCallback((size: number) => {
    if (size > PREVIEW_CONSTANTS.COLLAPSED_SIZE) savePreviewSize(size);
  }, []);

  const expandPreview = useCallback((isSystem: boolean) => {
    isSystemPreviewToggle.current = isSystem;
    previewPanelRef.current?.resize(readPreviewSize());
  }, []);

  const togglePreview = useCallback(() => {
    if (isPreviewCollapsed) {
      expandPreview(false);
    } else {
      previewPanelRef.current?.collapse();
    }
  }, [expandPreview, isPreviewCollapsed]);

  // ── AI Assistant panel handlers ────────────────────────────────────────────

  const handleAiCollapse = useCallback(() => {
    setIsAiCollapsed(true);
    saveAiPref(true);
  }, []);

  const handleAiExpand = useCallback(() => {
    setIsAiCollapsed(false);
    saveAiPref(false);
  }, []);

  const handleAiResize = useCallback((size: number) => {
    if (size > AI_CONSTANTS.COLLAPSED_SIZE) saveAiSize(size);
  }, []);

  const toggleAi = useCallback(() => {
    if (isAiCollapsed) {
      aiPanelRef.current?.resize(readAiSize()); // restore to last saved size
    } else {
      aiPanelRef.current?.collapse();
    }
  }, [isAiCollapsed]);

  // ── Artifacts panel handlers ───────────────────────────────────────────────

  const toggleArtifacts = useCallback(() => {
    if (isArtifactsCollapsed) {
      artifactsPanelRef.current?.expand();
    } else {
      artifactsPanelRef.current?.collapse();
    }
  }, [isArtifactsCollapsed]);

  // ── Preview rendering ──────────────────────────────────────────────────────

  const preview = useMarkdownPreview({
    markdown: entity?.lastRenderedTemplate ?? '',
    enabled: Boolean(entity?.lastRenderedTemplate),
    debounceMs: 0,
  });

  const isDraft = dataMart?.status.code === DataMartStatus.DRAFT;

  const isDirty = useMemo(() => {
    if (!entity) return false;
    return entity.template !== template;
  }, [entity, template]);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadEntity = useCallback(async (): Promise<string | null> => {
    if (!dataMart?.id || !insightId) return null;
    try {
      const templateDto = await insightTemplatesService.getInsightTemplateById(
        dataMart.id,
        insightId
      );
      const mapped = mapInsightTemplateFromDto(templateDto);
      setEntity(mapped);
      setTemplate(mapped.template ?? '');
      const runError = extractLatestRunError(templateDto.lastManualDataMartRun);
      setRunErrorMessage(runError);

      return runError;
    } catch {
      toast.error('Failed to load insight');
      void navigate('..');
      return null;
    }
  }, [dataMart?.id, insightId, navigate]);

  const ensureActiveRunPolling = useCallback(async () => {
    if (!dataMart?.id || !insightId || triggerId) return;

    try {
      const res = await insightTemplatesService.getInsightTemplateRunTriggers(
        dataMart.id,
        insightId,
        { skipLoadingIndicator: true }
      );
      const active = res.data
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .find(t => !isTaskFinalStatus(t.status));

      if (active?.id) {
        setIsRunning(true);
        setTriggerId(active.id);
      }
    } catch (error) {
      console.error('Failed to ensure active run polling', error);
    }
  }, [dataMart?.id, insightId, triggerId]);

  useEffect(() => {
    void loadEntity().then(() => {
      if (entity?.lastRun && !isDataMartRunFinalStatus(entity.lastRun.status)) {
        void ensureActiveRunPolling();
      }
    });
  }, [loadEntity]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Run polling ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!triggerId || !dataMart?.id || !insightId) return;

    const controller = new AbortController();
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const statusResponse = await insightTemplatesService.checkInsightTemplateExecutionStatus(
            dataMart.id,
            triggerId,
            insightId,
            { skipLoadingIndicator: true, signal: controller.signal }
          );

          const status = statusResponse.status;
          if (status === 'SUCCESS' || status === 'ERROR' || status === 'CANCELLED') {
            window.clearInterval(interval);
            setTriggerId(null);
            setIsRunning(false);

            const runError = await loadEntity();
            if (status === 'CANCELLED') {
              toast.error('Insight run was cancelled');
            } else if (runError) {
              toast.error('Insight run failed');
            } else {
              toast.success('Insight run completed');
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          window.clearInterval(interval);
          setTriggerId(null);
          setIsRunning(false);
          const message = 'Failed to check insight run status';
          setRunErrorMessage(message);
          toast.error(message);
        }
      })();
    }, 2500);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [dataMart?.id, insightId, loadEntity, triggerId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (): Promise<InsightTemplateEntity | null> => {
    if (!dataMart?.id || !insightId || !entity || !canEdit) return null;

    setSaving(true);
    try {
      const dto = await insightTemplatesService.updateInsightTemplate(dataMart.id, insightId, {
        title: entity.title,
        template,
      });
      const updated = mapInsightTemplateFromDto(dto);
      setEntity(updated);
      setTemplate(updated.template ?? '');
      toast.success('Insight saved');
      return updated;
    } catch {
      toast.error('Failed to save insight');
      return null;
    } finally {
      setSaving(false);
    }
  }, [canEdit, dataMart?.id, entity, insightId, template]);

  const handleRun = useCallback(async () => {
    if (!dataMart?.id || !insightId || isRunning || isDraft) return;
    setRunErrorMessage(null);
    setIsRunning(true);

    expandPreview(true);

    try {
      const { triggerId: nextTriggerId } =
        await insightTemplatesService.startInsightTemplateExecution(dataMart.id, insightId);
      setTriggerId(nextTriggerId);
    } catch {
      setIsRunning(false);
      toast.error('Failed to start insight run');
    }
  }, [dataMart?.id, expandPreview, insightId, isDraft, isRunning]);

  const handleCancelRun = useCallback(async () => {
    if (!dataMart?.id || !insightId || !triggerId) return;
    try {
      await insightTemplatesService.abortInsightTemplateExecution(
        dataMart.id,
        insightId,
        triggerId
      );
      toast.success('Run cancelled');
    } catch {
      toast.error('Failed to cancel run');
    }
  }, [dataMart?.id, insightId, triggerId]);

  const handleDelete = useCallback(async () => {
    if (!dataMart?.id || !insightId || !canDelete) return;
    try {
      await insightTemplatesService.deleteInsightTemplate(dataMart.id, insightId);
      toast.success('Insight deleted');
      void navigate('..');
    } catch {
      toast.error('Failed to delete insight');
    }
  }, [canDelete, dataMart?.id, insightId, navigate]);

  const { data: sources = [], refetch: refetchSources } = useInsightTemplateSources(
    dataMart?.id ?? '',
    insightId ?? ''
  );

  const handleApplied = useCallback(() => {
    void loadEntity();
    void refetchSources();
  }, [loadEntity, refetchSources]);

  const handleAddReport = useCallback((fromList = false) => {
    setReportToEdit(undefined);
    setReportFormMode(ReportFormMode.CREATE);
    setShouldReopenReportsList(fromList);
    setIsReportSheetOpen(true);
  }, []);

  const handleSendAndSchedule = useCallback(() => {
    if (reports.length > 0) {
      setIsReportsListOpen(true);
    } else {
      handleAddReport();
    }
  }, [reports.length, handleAddReport]);

  const handleEditReport = useCallback((report: DataMartReport, fromList = false) => {
    setReportToEdit(report);
    setReportFormMode(ReportFormMode.EDIT);
    setShouldReopenReportsList(fromList);
    setIsReportSheetOpen(true);
  }, []);

  const canRun = !isDraft;
  const isRunPending = isRunning || triggerId !== null;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const ua = navigator.userAgent || '';
      const isMac = /\bMac|iPod|iPhone|iPad\b/.test(ua);
      const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
      if (!ctrlOrCmd) return;

      if (event.key === 's') {
        event.preventDefault();
        if (isDirty && !saving) void handleSave();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (canRun && !isRunPending) void handleRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [canRun, handleRun, handleSave, isDirty, isRunPending, saving]);

  return (
    <div className='flex h-full w-full flex-col overflow-visible'>
      <div className='mb-2 flex shrink-0 items-center gap-3'>
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
                  title={entity?.title ?? ''}
                  onUpdate={async (value: string) => {
                    if (!entity || !dataMart?.id || !insightId) return;
                    await insightTemplatesService.updateInsightTemplateTitle(
                      dataMart.id,
                      insightId,
                      value
                    );
                    setEntity({ ...entity, title: value });
                    toast.success('Title updated');
                  }}
                  readOnly={!canEdit}
                />
              </span>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='ml-auto flex items-center gap-2 pr-1'>
          {isDirty && (
            <>
              <span className='flex items-center gap-1.5 text-xs font-medium text-yellow-600'>
                <Circle className='h-2 w-2 fill-current' />
                Unsaved changes
              </span>
              <Button
                variant='default'
                disabled={saving || !canEdit}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                Save
              </Button>
            </>
          )}
          <Button
            disabled={!canRun || isRunPending || isDirty}
            onClick={() => void handleRun()}
            variant={!isDirty ? 'default' : 'outline'}
          >
            {isRunPending ? (
              <Loader2 className='mr-1 h-4 w-4 animate-spin' />
            ) : (
              <Play className='mr-1h-4 w-4' />
            )}
            {isRunPending ? 'Running…' : 'Run Insight'}
          </Button>
          <Button
            variant='outline'
            disabled={!canRun || isRunPending || isDirty}
            onClick={handleSendAndSchedule}
            className='relative gap-2'
          >
            <Send className='h-4 w-4' />
            Send & Schedule
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon'>
                <MoreVertical className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                disabled={!canDelete}
                onClick={() => {
                  if (!canDelete) {
                    toast.error(NO_PERMISSION_MESSAGE);
                    return;
                  }
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 className='mr-2 h-4 w-4 text-red-600' />
                <span className='text-red-600'>Delete insight</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!isRunPending} onClick={() => void handleCancelRun()}>
                Cancel run
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ResizablePanelGroup direction='horizontal' className='flex-1 gap-1 overflow-hidden'>
        {/* AI Assistant panel */}
        <ResizablePanel
          ref={aiPanelRef}
          defaultSize={aiDefaultSize}
          minSize={15}
          collapsible
          collapsedSize={AI_CONSTANTS.COLLAPSED_SIZE}
          onCollapse={handleAiCollapse}
          onExpand={handleAiExpand}
          onResize={handleAiResize}
          className='overflow-hidden rounded-lg border'
          style={isAiCollapsed ? { minWidth: '40px', maxWidth: '40px' } : { minWidth: '250px' }}
        >
          <div className='flex h-full flex-col'>
            {isAiCollapsed ? (
              <button
                onClick={toggleAi}
                className='text-muted-foreground hover:text-foreground flex h-full w-full flex-col items-center gap-3 py-3 transition-colors'
                title='Expand AI Assistant'
              >
                <PanelLeftOpen className='h-4 w-4 shrink-0' />
                <span className='rotate-180 text-xs font-medium [writing-mode:vertical-rl]'>
                  AI Assistant
                </span>
              </button>
            ) : (
              <>
                <div className='flex h-12 shrink-0 items-center justify-between border-b px-4'>
                  <div className='text-sm font-medium'>AI Assistant</div>
                  <div className='flex items-center gap-1'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className='inline-flex'>
                          <Button
                            size='icon'
                            variant='ghost'
                            className='h-8 w-8'
                            aria-label='New chat'
                            disabled={!canEdit || isAiBusy}
                            onClick={() => void aiAssistantRef.current?.startNewConversation()}
                          >
                            <Plus className='h-4 w-4' />
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {!canEdit ? NO_PERMISSION_MESSAGE : 'New chat'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size='icon'
                          variant='ghost'
                          className='h-8 w-8'
                          aria-label={isAiHistoryView ? 'Back to chat' : 'Chat history'}
                          disabled={isAiBusy}
                          onClick={() => {
                            setIsAiHistoryView(prev => !prev);
                          }}
                        >
                          {isAiHistoryView ? (
                            <MessageSquare className='h-4 w-4' />
                          ) : (
                            <History className='h-4 w-4' />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isAiHistoryView ? 'Back to chat' : 'Chat history'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size='icon' variant='ghost' className='h-8 w-8' onClick={toggleAi}>
                          <PanelLeftClose className='h-4 w-4' />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Hide</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                {dataMart?.id ? (
                  <AiAssistantPanel
                    ref={aiAssistantRef}
                    dataMartId={dataMart.id}
                    scope='template'
                    templateId={insightId}
                    canEdit={canEdit}
                    isHistoryView={isAiHistoryView}
                    onHistoryViewChange={setIsAiHistoryView}
                    onBusyChange={setIsAiBusy}
                    onApplied={handleApplied}
                    onRun={handleRun}
                  />
                ) : (
                  <div className='text-muted-foreground p-4 text-sm'>No data mart context.</div>
                )}
              </>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle className='bg-transparent after:w-3' />

        <ResizablePanel defaultSize={72} minSize={30} className='overflow-hidden'>
          <ResizablePanelGroup direction='horizontal' className='h-full gap-1'>
            {/* Editor panel */}
            <ResizablePanel
              defaultSize={55}
              minSize={20}
              className='overflow-hidden rounded-lg border'
            >
              <div className='flex h-full flex-col'>
                <div className='flex h-12 shrink-0 items-center justify-between border-b px-4'>
                  <div className='text-sm font-medium'>Insight</div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='text-muted-foreground hover:text-foreground h-auto gap-1.5 px-2 py-1 text-xs font-normal'
                        onClick={() => {
                          setIsReportsListOpen(true);
                        }}
                      >
                        <FileText className='h-4 w-4' />
                        {reports.length > 0 ? `${String(reports.length)} reports` : 'No reports'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {reports.length > 0
                        ? getReportsTooltipText(reports)
                        : 'No reports configured for this Insight yet'}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <ResizablePanelGroup
                  direction='vertical'
                  className='min-h-0 flex-1'
                  autoSaveId='insight-editor-artifacts-v'
                >
                  <ResizablePanel defaultSize={65} minSize={20}>
                    <InsightTemplateEditor
                      value={template}
                      onChange={setTemplate}
                      sources={sources}
                      readOnly={!canEdit}
                      height='100%'
                      onMount={handleEditorMount}
                    />
                  </ResizablePanel>
                  <ResizableHandle withHandle className='after:w-3' />
                  <ResizablePanel
                    ref={artifactsPanelRef}
                    defaultSize={artifactsDefaultSize}
                    minSize={20}
                    collapsible
                    collapsedSize={0}
                    onCollapse={() => {
                      setIsArtifactsCollapsed(true);
                      saveArtifactsPref(true);
                    }}
                    onExpand={() => {
                      setIsArtifactsCollapsed(false);
                      saveArtifactsPref(false);
                    }}
                  >
                    <InsightSourcesPanel
                      dataMartId={dataMart?.id ?? ''}
                      insightId={insightId ?? ''}
                      canEdit={canEdit}
                      isRunning={isRunPending}
                      saving={saving}
                      onInsertTemplate={handleInsertTemplate}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
                <div className='bg-muted/50 text-muted-foreground flex h-9 shrink-0 items-center border-t px-3 text-xs'>
                  Data Artifacts ({sources.length}/5)
                  <Button
                    variant='ghost'
                    size='sm'
                    className='ml-auto h-7 px-2'
                    onClick={toggleArtifacts}
                  >
                    {isArtifactsCollapsed ? (
                      <ChevronUp className='h-4 w-4' />
                    ) : (
                      <ChevronDown className='h-4 w-4' />
                    )}
                  </Button>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle className='bg-transparent after:w-3' />

            {/* Preview panel */}
            <ResizablePanel
              ref={previewPanelRef}
              defaultSize={previewDefaultSize}
              minSize={15}
              collapsible
              collapsedSize={PREVIEW_CONSTANTS.COLLAPSED_SIZE}
              onCollapse={handlePreviewCollapse}
              onExpand={handlePreviewExpand}
              onResize={handlePreviewResize}
              className='overflow-hidden rounded-lg border'
              style={isPreviewCollapsed ? { minWidth: '40px', maxWidth: '40px' } : undefined}
            >
              <div className='flex h-full flex-col'>
                {isPreviewCollapsed ? (
                  <button
                    onClick={togglePreview}
                    className='text-muted-foreground hover:text-foreground flex h-full w-full flex-col items-center gap-3 py-3 transition-colors'
                    title='Expand Preview'
                  >
                    <PanelRightOpen className='h-4 w-4 shrink-0' />
                    <span className='rotate-180 text-xs font-medium [writing-mode:vertical-rl]'>
                      Preview
                    </span>
                  </button>
                ) : (
                  <>
                    <div className='flex h-12 shrink-0 items-center justify-between border-b px-4'>
                      <div className='text-sm font-medium'>Preview</div>
                      <div className='flex items-center gap-2'>
                        {runErrorMessage ? (
                          <span className='text-xs text-red-500'>Last run failed</span>
                        ) : null}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size='icon'
                              variant='ghost'
                              className='h-8 w-8'
                              disabled={!entity?.lastRenderedTemplate}
                              onClick={handleCopyMarkdown}
                            >
                              {isCopied ? (
                                <Check className='h-4 w-4' />
                              ) : (
                                <Copy className='h-4 w-4' />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isCopied ? 'Copied!' : 'Copy markdown'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size='icon'
                              variant='ghost'
                              className='h-8 w-8'
                              onClick={togglePreview}
                            >
                              <PanelRightClose className='h-4 w-4' />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Hide</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className='flex min-h-0 flex-1 flex-col overflow-hidden p-1'>
                      {isRunPending ? (
                        <InsightLoader />
                      ) : preview.loading ? (
                        <InsightLoader />
                      ) : preview.html ? (
                        <MarkdownEditorPreview
                          html={preview.html}
                          height='100%'
                          className='flex-1'
                        />
                      ) : (
                        <Empty className='h-full'>
                          <EmptyHeader>
                            <EmptyMedia variant='icon'>
                              <Sparkles />
                            </EmptyMedia>
                            <EmptyTitle>Even data needs a little spark</EmptyTitle>
                            <EmptyDescription>
                              Run the insight to uncover the story behind your data!
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <InsightReportsSheet
        isOpen={isReportsListOpen}
        onClose={() => {
          setIsReportsListOpen(false);
        }}
        dataMartId={dataMart?.id ?? ''}
        insightId={insightId ?? ''}
        onEditReport={report => {
          handleEditReport(report, true);
        }}
        onCreateReport={() => {
          handleAddReport(true);
        }}
      />

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={() => void handleDelete()}
        title='Delete insight'
        description='This action cannot be undone. Delete this insight?'
        confirmLabel='Delete'
        variant='destructive'
      />

      <ReportsProvider>
        <EmailReportEditSheet
          isOpen={isReportSheetOpen}
          onClose={() => {
            setIsReportSheetOpen(false);
            if (shouldReopenReportsList) {
              setIsReportsListOpen(true);
              setShouldReopenReportsList(false);
            }
          }}
          mode={reportFormMode}
          initialReport={reportToEdit}
          preSelectedDestination={null}
          isInsightContext={true}
          prefill={{
            title: entity?.title ? `Report: ${entity.title}` : 'New report',
            subject: entity?.title ? `Insight: ${entity.title}` : 'Insight Report',
            messageTemplate: template,
            insightTemplateId: insightId,
            templateSourceType: TemplateSourceTypeEnum.INSIGHT_TEMPLATE,
          }}
          allowedDestinationTypes={[
            DataDestinationType.EMAIL,
            DataDestinationType.SLACK,
            DataDestinationType.MS_TEAMS,
            DataDestinationType.GOOGLE_CHAT,
          ]}
        />
      </ReportsProvider>
    </div>
  );
}

function extractLatestRunError(
  run: { status?: string | null; id?: string | null } | null | undefined
): string | null {
  if (run?.status !== DataMartRunStatus.FAILED) return null;
  return 'Execution failed';
}
