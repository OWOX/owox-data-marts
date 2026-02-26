import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Editor } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ChevronDown, ChevronUp, GripHorizontal, Plus, Table2, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { NO_PERMISSION_MESSAGE } from '../../../../app/permissions';
import { Combobox } from '../../../../shared/components/Combobox/combobox.tsx';
import { storageService } from '../../../../services/localstorage.service';
import { insightArtifactsService, type InsightArtifactEntity } from '../../insight-artifacts';
import type { InsightTemplateSourceDto } from '../model';

const MAX_TEMPLATE_SOURCES = 5;
const SOURCES_PANEL_HEIGHT_STORAGE_KEY = 'insight-template-sources-panel-height';
const SOURCES_PANEL_DEFAULT_HEIGHT = 260;
const SOURCES_PANEL_MIN_HEIGHT = 120;
const SOURCES_PANEL_MAX_HEIGHT = 560;
const SOURCES_PANEL_COLLAPSED_HEIGHT = 72;

interface InsightTemplateSourcesBottomPanelProps {
  dataMartId?: string;
  insightTemplateId?: string;
  sources: InsightTemplateSourceDto[];
  setSources: Dispatch<SetStateAction<InsightTemplateSourceDto[]>>;
  artifacts: InsightArtifactEntity[];
  canEdit: boolean;
  isRunning: boolean;
  saving: boolean;
  duplicatedKeys: ReadonlySet<string>;
}

export function InsightTemplateSourcesBottomPanel({
  dataMartId,
  insightTemplateId,
  sources,
  setSources,
  artifacts,
  canEdit,
  isRunning,
  saving,
  duplicatedKeys,
}: InsightTemplateSourcesBottomPanelProps) {
  const { resolvedTheme } = useTheme();
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [isSourcesPanelCollapsed, setIsSourcesPanelCollapsed] = useState(false);
  const [artifactSqlById, setArtifactSqlById] = useState<Record<string, string>>({});
  const [sourcesPanelHeight, setSourcesPanelHeight] = useState(() => {
    const saved = storageService.get(SOURCES_PANEL_HEIGHT_STORAGE_KEY);
    if (typeof saved !== 'string') {
      return SOURCES_PANEL_DEFAULT_HEIGHT;
    }

    const parsed = Number(saved);
    if (Number.isNaN(parsed)) {
      return SOURCES_PANEL_DEFAULT_HEIGHT;
    }

    return clampPanelHeight(parsed, SOURCES_PANEL_MAX_HEIGHT);
  });

  const panelWrapperRef = useRef<HTMLDivElement | null>(null);
  const sourcesPanelHeightRef = useRef(sourcesPanelHeight);
  const artifactSqlByIdRef = useRef<Record<string, string>>({});
  const loadingArtifactSqlIdsRef = useRef<Set<string>>(new Set());
  const dragStateRef = useRef<{
    startY: number;
    startHeight: number;
    maxHeight: number;
  } | null>(null);

  const hasArtifacts = artifacts.length > 0;
  const artifactsById = useMemo(() => new Map(artifacts.map(item => [item.id, item])), [artifacts]);

  useEffect(() => {
    sourcesPanelHeightRef.current = sourcesPanelHeight;
  }, [sourcesPanelHeight]);

  useEffect(() => {
    artifactSqlByIdRef.current = {};
    loadingArtifactSqlIdsRef.current.clear();
    setArtifactSqlById({});
  }, [dataMartId, insightTemplateId]);

  const updateArtifactSqlCache = useCallback((artifactId: string, sql: string) => {
    artifactSqlByIdRef.current = {
      ...artifactSqlByIdRef.current,
      [artifactId]: sql,
    };
    setArtifactSqlById(prev => {
      if (prev[artifactId] === sql) return prev;
      return { ...prev, [artifactId]: sql };
    });
  }, []);

  const ensureArtifactSqlLoaded = useCallback(
    async (artifactId: string): Promise<void> => {
      if (!dataMartId || !artifactId) return;
      if (Object.prototype.hasOwnProperty.call(artifactSqlByIdRef.current, artifactId)) return;
      if (loadingArtifactSqlIdsRef.current.has(artifactId)) return;

      loadingArtifactSqlIdsRef.current.add(artifactId);
      try {
        const artifact = await insightArtifactsService.getInsightArtifactById(
          dataMartId,
          artifactId
        );
        updateArtifactSqlCache(artifactId, artifact.sql);
      } catch {
        updateArtifactSqlCache(artifactId, '');
      } finally {
        loadingArtifactSqlIdsRef.current.delete(artifactId);
      }
    },
    [dataMartId, updateArtifactSqlCache]
  );

  useEffect(() => {
    const sourceArtifactIds = Array.from(
      new Set(sources.map(source => source.artifactId).filter((id): id is string => Boolean(id)))
    );

    for (const artifactId of sourceArtifactIds) {
      void ensureArtifactSqlLoaded(artifactId);
    }
  }, [ensureArtifactSqlLoaded, sources]);

  const toggleSourcesPanel = useCallback(() => {
    setIsSourcesPanelCollapsed(prev => !prev);
  }, []);

  const handleSourcesPanelResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isSourcesPanelCollapsed) return;

      const containerHeight = panelWrapperRef.current?.parentElement?.clientHeight ?? 0;
      const maxHeight = Math.min(
        SOURCES_PANEL_MAX_HEIGHT,
        Math.max(SOURCES_PANEL_MIN_HEIGHT, containerHeight - 80)
      );

      dragStateRef.current = {
        startY: event.clientY,
        startHeight: sourcesPanelHeight,
        maxHeight,
      };
      document.body.style.userSelect = 'none';
    },
    [isSourcesPanelCollapsed, sourcesPanelHeight]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const delta = dragState.startY - event.clientY;
      const nextHeight = clampPanelHeight(dragState.startHeight + delta, dragState.maxHeight);
      setSourcesPanelHeight(nextHeight);
    };

    const handleMouseUp = () => {
      if (!dragStateRef.current) return;
      storageService.set(SOURCES_PANEL_HEIGHT_STORAGE_KEY, sourcesPanelHeightRef.current);
      dragStateRef.current = null;
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, []);

  const addSource = useCallback(() => {
    if (sources.length >= MAX_TEMPLATE_SOURCES) return;
    if (!hasArtifacts) {
      toast.error('Create an insight artifact first');
      return;
    }

    const firstAvailableArtifactId =
      artifacts.find(item => item.validationStatus === 'VALID')?.id ?? artifacts.at(0)?.id ?? null;

    const nextKey = `source_${String(sources.length + 1)}`;
    const nextIndex = sources.length;
    const nextSource: InsightTemplateSourceDto = {
      key: nextKey,
      type: 'INSIGHT_ARTIFACT',
      kind: 'TABLE',
      artifactId: firstAvailableArtifactId,
    };

    setSources(prev => [...prev, nextSource]);
    setExpandedSourceId(`source-${String(nextIndex)}`);
    setIsSourcesPanelCollapsed(false);
    if (firstAvailableArtifactId) {
      void ensureArtifactSqlLoaded(firstAvailableArtifactId);
    }
  }, [artifacts, ensureArtifactSqlLoaded, hasArtifacts, setSources, sources.length]);

  const updateSource = useCallback(
    (index: number, next: Partial<InsightTemplateSourceDto>) => {
      setSources(prev =>
        prev.map((source, i) => {
          if (i !== index) return source;
          const updated: InsightTemplateSourceDto = { ...source, ...next };
          if (updated.type !== 'INSIGHT_ARTIFACT') {
            updated.artifactId = null;
          }
          return updated;
        })
      );
    },
    [setSources]
  );

  const removeSource = useCallback(
    (index: number) => {
      setSources(prev => prev.filter((_, i) => i !== index));
      setExpandedSourceId(prev => {
        if (!prev) return prev;

        const currentIndex = Number(prev.replace('source-', ''));
        if (Number.isNaN(currentIndex)) return null;
        if (currentIndex === index) return null;
        if (currentIndex > index) return `source-${String(currentIndex - 1)}`;
        return prev;
      });
    },
    [setSources]
  );

  useEffect(() => {
    if (sources.length === 0) {
      setExpandedSourceId(null);
    }
  }, [sources.length]);

  return (
    <div
      ref={panelWrapperRef}
      className='pointer-events-none absolute right-2 bottom-2 left-2 z-20'
    >
      <div
        className='bg-background pointer-events-auto overflow-hidden rounded-md border shadow-md'
        style={{
          height: isSourcesPanelCollapsed ? SOURCES_PANEL_COLLAPSED_HEIGHT : sourcesPanelHeight,
        }}
      >
        <div className='flex h-full min-h-0 flex-col'>
          <div
            className='group flex cursor-row-resize justify-center border-b py-1'
            onMouseDown={handleSourcesPanelResizeStart}
            title='Drag to resize sources panel'
          >
            <GripHorizontal className='text-muted-foreground group-hover:text-foreground h-4 w-4' />
          </div>

          <div className='bg-background flex items-center justify-between border-b px-3 py-2'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium'>Sources</span>
              <span className='text-muted-foreground text-xs'>
                {sources.length}/{MAX_TEMPLATE_SOURCES}
              </span>
            </div>

            <div className='flex items-center gap-2'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={addSource}
                      disabled={
                        !canEdit ||
                        isRunning ||
                        saving ||
                        sources.length >= MAX_TEMPLATE_SOURCES ||
                        !hasArtifacts
                      }
                    >
                      <Plus className='h-4 w-4' />
                      Add source
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canEdit && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
                {canEdit && !hasArtifacts && (
                  <TooltipContent>Create an insight artifact first</TooltipContent>
                )}
              </Tooltip>

              <Button
                size='icon'
                variant='ghost'
                onClick={toggleSourcesPanel}
                aria-label={
                  isSourcesPanelCollapsed ? 'Expand sources panel' : 'Collapse sources panel'
                }
              >
                {isSourcesPanelCollapsed ? (
                  <ChevronUp className='h-4 w-4' />
                ) : (
                  <ChevronDown className='h-4 w-4' />
                )}
              </Button>
            </div>
          </div>

          {!isSourcesPanelCollapsed && (
            <div className='min-h-0 flex-1 overflow-auto p-3'>
              {sources.length === 0 ? (
                <div className='text-muted-foreground rounded border border-dashed p-3 text-sm'>
                  Add a source to template
                </div>
              ) : (
                <Accordion
                  type='single'
                  collapsible
                  value={expandedSourceId ?? ''}
                  onValueChange={value => {
                    setExpandedSourceId(value || null);
                  }}
                  className='bg-background rounded-md border'
                >
                  {sources.map((source, index) => {
                    const itemId = `source-${String(index)}`;
                    const SourceIcon = Table2;
                    const sourceKindLabel = 'table';
                    const hasDuplicate =
                      duplicatedKeys.has(source.key.trim()) && source.key.trim().length > 0;
                    const selectedArtifact = source.artifactId
                      ? artifactsById.get(source.artifactId)
                      : null;
                    const artifactOptions = artifacts
                      .filter(
                        artifact =>
                          artifact.validationStatus === 'VALID' || artifact.id === source.artifactId
                      )
                      .map(artifact => ({
                        value: artifact.id,
                        label:
                          artifact.validationStatus === 'ERROR'
                            ? `${artifact.title} (ERROR)`
                            : artifact.title,
                      }));
                    const cachedSql = source.artifactId
                      ? artifactSqlById[source.artifactId]
                      : undefined;
                    const sourceSql =
                      source.type === 'INSIGHT_ARTIFACT'
                        ? !source.artifactId
                          ? '-- Select an insight artifact to preview SQL'
                          : cachedSql == null
                            ? '-- Loading artifact SQL...'
                            : cachedSql.trim().length > 0
                              ? cachedSql
                              : '-- Artifact SQL is empty'
                        : '-- Current Data Mart source does not expose artifact SQL preview';

                    return (
                      <AccordionItem key={itemId} value={itemId}>
                        <AccordionTrigger className='w-full px-3 py-2 hover:no-underline'>
                          <div className='flex min-w-0 flex-1 items-center gap-2'>
                            <SourceIcon className='text-muted-foreground h-4 w-4 shrink-0' />
                            <span
                              className='truncate text-sm font-medium'
                              title={source.key || `source_${String(index + 1)}`}
                            >
                              {source.key || `source_${String(index + 1)}`}
                            </span>
                            <span className='text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] uppercase'>
                              {sourceKindLabel}
                            </span>
                          </div>
                          <span
                            className='text-muted-foreground max-w-[45%] min-w-0 shrink truncate text-xs'
                            title={
                              source.type === 'INSIGHT_ARTIFACT'
                                ? (selectedArtifact?.title ?? 'Select artifact')
                                : 'Current Data Mart'
                            }
                          >
                            {source.type === 'INSIGHT_ARTIFACT'
                              ? (selectedArtifact?.title ?? 'Select artifact')
                              : 'Current Data Mart'}
                          </span>
                        </AccordionTrigger>

                        <AccordionContent className='px-0 pb-0'>
                          <div className='space-y-3 border-t px-3 py-3'>
                            <div className='grid grid-cols-12 gap-2'>
                              <div className='col-span-4'>
                                <Input
                                  value={source.key}
                                  onChange={e => {
                                    updateSource(index, { key: e.target.value });
                                  }}
                                  disabled={!canEdit || isRunning || saving}
                                  placeholder='source key'
                                />
                                {hasDuplicate && (
                                  <div className='mt-1 text-xs text-red-600'>
                                    Source key must be unique
                                  </div>
                                )}
                              </div>

                              <div className='col-span-7'>
                                {source.type === 'INSIGHT_ARTIFACT' ? (
                                  <Combobox
                                    options={artifactOptions}
                                    value={source.artifactId ?? ''}
                                    onValueChange={value => {
                                      const artifactId = value || null;
                                      updateSource(index, {
                                        artifactId,
                                      });
                                      if (artifactId) {
                                        void ensureArtifactSqlLoaded(artifactId);
                                      }
                                    }}
                                    placeholder='Select artifact'
                                    emptyMessage='No artifacts found'
                                    className='w-full'
                                    disabled={!canEdit || isRunning || saving}
                                  />
                                ) : (
                                  <div className='text-muted-foreground flex h-9 items-center rounded-md border px-2 text-xs'>
                                    Current Data Mart source
                                  </div>
                                )}
                              </div>

                              <div className='col-span-1 flex justify-end'>
                                <Button
                                  size='icon'
                                  variant='ghost'
                                  onClick={() => {
                                    removeSource(index);
                                  }}
                                  disabled={!canEdit || isRunning || saving}
                                  aria-label='Remove source'
                                >
                                  <Trash2 className='h-4 w-4' />
                                </Button>
                              </div>
                            </div>

                            <div className='overflow-hidden rounded-md border'>
                              <Editor
                                className='overflow-hidden'
                                language='sql'
                                value={sourceSql}
                                height='180px'
                                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                                options={{
                                  minimap: { enabled: false },
                                  scrollBeyondLastLine: false,
                                  wordWrap: 'on',
                                  automaticLayout: true,
                                  overviewRulerBorder: false,
                                  overviewRulerLanes: 0,
                                  readOnly: true,
                                }}
                              />
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function clampPanelHeight(value: number, maxHeight: number) {
  return Math.max(SOURCES_PANEL_MIN_HEIGHT, Math.min(maxHeight, value));
}
