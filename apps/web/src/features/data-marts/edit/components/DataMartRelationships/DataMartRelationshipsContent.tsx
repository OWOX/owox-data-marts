import { SearchInput } from '@owox/ui/components/common/search-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { GitMerge, Link2, List, Network, Plus } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useDataMartContext } from '../../model/context/useDataMartContext';
import { useDebounce } from '../../../../../hooks/useDebounce';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/blendable-schema-query-key';
import { useBlendableSchema } from '../../../shared/hooks/useBlendableSchema';
import { Button } from '../../../../../shared/components/Button';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../../../shared/components/CollapsibleCard';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  AvailableSource,
  BlendedField,
  BlendedFieldOverride,
  BlendedFieldsConfig,
  BlendedSource,
  DataMartRelationship,
  RelationshipGraph,
} from '../../../shared/types/relationship.types';

import { storageService } from '../../../../../services/localstorage.service';
import {
  parseCanvasDirection,
  type CanvasDirection,
} from '../../../shared/canvas/canvas-direction';
import type { ErdCardField } from '../../../shared/canvas/erd-fields';
import {
  parseObjectLabelsHidden,
  serializeObjectLabelsHidden,
  type ObjectLabelsHidden,
} from '../../../shared/canvas/object-labels';
import { parseCanvasViewMode, type CanvasViewMode } from '../../../shared/canvas/view-mode';
import {
  filterTransientRows,
  parseRelationshipStatusFilter,
  RELATIONSHIP_STATUS_FILTER_OPTIONS,
  type RelationshipStatusFilter,
} from './relationship-filters';
import { cleanBlendedFieldOverride } from './blended-field-override.utils';
import type { SourceEntry } from './RelationshipAccordionItem';
import { RelationshipAccordionItem } from './RelationshipAccordionItem';
import { TargetDataMartPicker } from './TargetDataMartPicker';
import { useRelationshipDefinitionTypes } from './useRelationshipDefinitionTypes';
import { useTransientRelationships } from './useTransientRelationships';

// Load React Flow and the graph renderer only when the user switches to graph
// view so the default table path keeps the main bundle small.
const RelationshipCanvas = lazy(() =>
  import('./RelationshipCanvas').then(module => ({ default: module.RelationshipCanvas }))
);

const CanvasSuspenseFallback = (
  <div className='flex h-full w-full items-center justify-center'>
    <Skeleton className='h-full w-full' />
  </div>
);

const VIEW_MODE_KEY = 'relationship-view-mode';
const CONTENT_MIN_H = 480;

// Canvas view settings are per-browser preferences (not per data mart),
// mirroring the Models canvas keys (model-canvas-*).
const CANVAS_VIEW_MODE_KEY = 'relationship-canvas-view-mode';
const CANVAS_LAYOUT_KEY = 'relationship-canvas-layout';
const CANVAS_JOIN_FIELDS_KEY = 'relationship-canvas-show-join-fields';
const CANVAS_OBJECT_LABELS_KEY = 'relationship-canvas-object-labels';

const DEFAULT_BLENDED_FIELDS_CONFIG: BlendedFieldsConfig = { sources: [] };
const EMPTY_STRING_ARRAY: string[] = [];

interface DataMartRelationshipsContentProps {
  onRelationshipsChanged?: () => void;
}

function buildSourceList(
  availableSources: AvailableSource[],
  blendedFields: BlendedField[],
  config: BlendedFieldsConfig
): SourceEntry[] {
  const fieldsByPath = new Map<string, BlendedField[]>();
  for (const field of blendedFields) {
    const existing = fieldsByPath.get(field.aliasPath);
    if (existing) {
      existing.push(field);
    } else {
      fieldsByPath.set(field.aliasPath, [field]);
    }
  }

  return availableSources.map(src => {
    const configSource = config.sources.find(s => s.path === src.aliasPath);
    const overrideCount = configSource?.fields
      ? Object.values(configSource.fields).filter(
          v =>
            v.isHidden !== undefined ||
            v.aggregateFunction !== undefined ||
            v.alias !== undefined ||
            v.postJoinAggregations !== undefined
        ).length
      : 0;

    return {
      aliasPath: src.aliasPath,
      title: src.title,
      alias: configSource?.alias ?? src.defaultAlias,
      depth: src.depth - 1,
      fieldCount: src.fieldCount,
      overrideCount,
      isIncluded: src.isIncluded,
      fields: fieldsByPath.get(src.aliasPath) ?? [],
      dataMartId: src.dataMartId,
      descriptionOverride: configSource?.description,
    };
  });
}

export function DataMartRelationshipsContent({
  onRelationshipsChanged,
}: DataMartRelationshipsContentProps) {
  const { dataMart, syncDataMartFromResponse, refreshDataMart } = useDataMartContext();
  const queryClient = useQueryClient();

  const invalidateBlendableSchema = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [BLENDABLE_SCHEMA_QUERY_KEY] });
  }, [queryClient]);

  const [relationshipGraph, setRelationshipGraph] = useState<RelationshipGraph | null>(null);
  const loadRelationshipsRequestIdRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const searchQuery = useDebounce(searchInput, 300);

  const [viewMode, setViewMode] = useState<'table' | 'graph'>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === 'graph' ? 'graph' : 'table';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dataMartId = dataMart?.id ?? '';
  const storageId = dataMart?.storage.id ?? '';

  const localBlendedFieldsConfig: BlendedFieldsConfig =
    dataMart?.blendedFieldsConfig ?? DEFAULT_BLENDED_FIELDS_CONFIG;
  const [localConfig, setLocalConfig] = useState<BlendedFieldsConfig>(localBlendedFieldsConfig);
  const localConfigRef = useRef(localConfig);
  useEffect(() => {
    localConfigRef.current = localConfig;
  }, [localConfig]);

  useEffect(() => {
    setLocalConfig(dataMart?.blendedFieldsConfig ?? DEFAULT_BLENDED_FIELDS_CONFIG);
  }, [dataMart?.blendedFieldsConfig]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const loadRelationships = useCallback(async () => {
    if (!dataMartId) return;
    const requestId = ++loadRelationshipsRequestIdRef.current;
    setRelationshipGraph(null);
    setIsLoading(true);
    try {
      const graph = await dataMartRelationshipService.getRelationshipGraph(dataMartId, {
        skipLoadingIndicator: true,
      });
      if (loadRelationshipsRequestIdRef.current !== requestId) return;
      setRelationshipGraph(graph);
    } catch {
      if (loadRelationshipsRequestIdRef.current !== requestId) return;
      toast.error('Failed to load relationships');
    } finally {
      if (loadRelationshipsRequestIdRef.current === requestId) setIsLoading(false);
    }
  }, [dataMartId]);

  const relationships = useMemo<DataMartRelationship[]>(() => {
    if (!relationshipGraph) return [];
    const direct = relationshipGraph.nodes
      .filter(node => node.depth === 1)
      .map(node => node.relationship);
    return [...direct].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [relationshipGraph]);

  useEffect(() => {
    void loadRelationships();
  }, [loadRelationships]);

  // Shared with the other cards on this page (the schema editor's formula autocomplete reads the
  // same entry): one fetch, one copy, and `invalidateBlendableSchema` below refreshes all of them.
  const { data: blendableSchema } = useBlendableSchema(dataMartId);

  const sourceList = useMemo(() => {
    if (!blendableSchema) return [];
    return buildSourceList(
      blendableSchema.availableSources,
      blendableSchema.blendedFields,
      localConfig
    );
  }, [blendableSchema, localConfig]);

  const connectedFieldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!blendableSchema) return counts;
    for (const field of blendableSchema.blendedFields) {
      if (field.type === 'UNKNOWN') continue;
      const relId = field.sourceRelationshipId;
      counts.set(relId, (counts.get(relId) ?? 0) + 1);
    }
    return counts;
  }, [blendableSchema]);

  const { rows: transientRows, isLoading: isLoadingTransient } =
    useTransientRelationships(relationshipGraph);

  // Enrichment fetches full data-mart details — only worth it when the
  // diagram is actually on screen (the list view never renders badges).
  const definitionTypes = useRelationshipDefinitionTypes(
    relationshipGraph,
    relationships,
    viewMode === 'graph'
  );

  // Toolbar filters apply to both the list and the diagram (and keep the
  // inline and fullscreen canvas instances in sync); keys are scoped per data
  // mart because a filter useful on one mart would silently truncate another's.
  const showLoopedKey = `relationship-canvas-show-looped:${dataMartId}`;
  const statusFilterKey = `relationship-canvas-status-filter:${dataMartId}`;
  const [showLooped, setShowLooped] = useState(
    () => storageService.get(showLoopedKey, 'boolean') ?? false
  );
  const [statusFilter, setStatusFilter] = useState<RelationshipStatusFilter>(() =>
    parseRelationshipStatusFilter(storageService.get(statusFilterKey))
  );

  const handleShowLoopedChange = useCallback(
    (checked: boolean) => {
      setShowLooped(checked);
      storageService.set(showLoopedKey, checked);
    },
    [showLoopedKey]
  );

  const handleStatusFilterChange = useCallback(
    (next: RelationshipStatusFilter) => {
      setStatusFilter(next);
      storageService.set(statusFilterKey, next);
    },
    [statusFilterKey]
  );

  // Canvas view settings (gear popover) live here so the inline and
  // fullscreen canvas instances stay in sync, like the filters above.
  const [canvasViewMode, setCanvasViewMode] = useState<CanvasViewMode>(() =>
    parseCanvasViewMode(storageService.get(CANVAS_VIEW_MODE_KEY))
  );
  const [canvasDirection, setCanvasDirection] = useState<CanvasDirection>(() =>
    parseCanvasDirection(storageService.get(CANVAS_LAYOUT_KEY))
  );
  const [showJoinFields, setShowJoinFields] = useState(
    () => storageService.get(CANVAS_JOIN_FIELDS_KEY, 'boolean') ?? false
  );
  const [objectLabels, setObjectLabels] = useState<ObjectLabelsHidden>(() =>
    parseObjectLabelsHidden(storageService.get(CANVAS_OBJECT_LABELS_KEY))
  );

  const handleCanvasViewModeChange = useCallback((next: CanvasViewMode) => {
    setCanvasViewMode(next);
    storageService.set(CANVAS_VIEW_MODE_KEY, next);
  }, []);

  const handleCanvasDirectionChange = useCallback((next: CanvasDirection) => {
    setCanvasDirection(next);
    storageService.set(CANVAS_LAYOUT_KEY, next);
  }, []);

  const handleShowJoinFieldsChange = useCallback((checked: boolean) => {
    setShowJoinFields(checked);
    storageService.set(CANVAS_JOIN_FIELDS_KEY, checked);
  }, []);

  const handleObjectLabelsChange = useCallback((next: ObjectLabelsHidden) => {
    setObjectLabels(next);
    storageService.set(CANVAS_OBJECT_LABELS_KEY, serializeObjectLabelsHidden(next));
  }, []);

  // ERD rows for the Detailed canvas view, keyed by aliasPath. The root
  // mart's native fields are untyped in the schema payload, so the root card
  // stays compact. Primary-key info is not part of the blendable schema —
  // rows render without key icons.
  const canvasFieldsByAliasPath = useMemo(() => {
    const map = new Map<string, ErdCardField[]>();
    if (!blendableSchema) return map;
    for (const field of blendableSchema.blendedFields) {
      // Mirror connectedFieldCounts: UNKNOWN-typed fields are not connected,
      // and a row the field-count badge does not count would make the card
      // contradict itself.
      if (field.type === 'UNKNOWN') continue;
      const rows = map.get(field.aliasPath) ?? [];
      if (!map.has(field.aliasPath)) map.set(field.aliasPath, rows);
      rows.push({
        name: field.originalFieldName,
        // The configured blend alias when set — the same fallback the Models
        // canvas mapper applies (alias?.trim() ? alias : name).
        alias: field.alias.trim() ? field.alias : field.originalFieldName,
        type: field.sourceFieldType ?? field.type,
        isPrimaryKey: false,
        isHidden: field.isHidden,
      });
    }
    return map;
  }, [blendableSchema]);

  const filteredRows = useMemo(() => {
    const rows = filterTransientRows(transientRows, { showLooped, statusFilter });
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      row =>
        row.relationship.targetDataMart.title.toLowerCase().includes(q) ||
        row.relationship.targetAlias.toLowerCase().includes(q)
    );
  }, [transientRows, showLooped, statusFilter, searchQuery]);

  // Backend enforces (sourceDataMartId, targetAlias) uniqueness. Precompute
  // sibling aliases per relationship so each row gets a stable reference and
  // the form can flag conflicts inline before the request fires.
  const siblingAliasesByRelId = useMemo(() => {
    const bySource = new Map<string, DataMartRelationship[]>();
    for (const r of relationships) {
      const arr = bySource.get(r.sourceDataMart.id);
      if (arr) arr.push(r);
      else bySource.set(r.sourceDataMart.id, [r]);
    }
    const result: Record<string, string[]> = {};
    for (const r of relationships) {
      result[r.id] = (bySource.get(r.sourceDataMart.id) ?? [])
        .filter(sibling => sibling.id !== r.id)
        .map(sibling => sibling.targetAlias);
    }
    return result;
  }, [relationships]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await dataMartRelationshipService.deleteRelationship(dataMartId, id, {
          skipLoadingIndicator: true,
        });
        toast.success('Relationship deleted');
        void loadRelationships();
        invalidateBlendableSchema();
        onRelationshipsChanged?.();
      } catch {
        toast.error('Failed to delete relationship');
      }
    },
    [dataMartId, loadRelationships, invalidateBlendableSchema, onRelationshipsChanged]
  );

  const handleRelationshipUpdated = useCallback(
    (updated: DataMartRelationship) => {
      toast.success('Relationship updated');
      const prevTargetAlias = relationships.find(r => r.id === updated.id)?.targetAlias;
      // Rename cascades paths in blendedFieldsConfig server-side; refetch to avoid overwriting it on next save.
      if (prevTargetAlias !== undefined && prevTargetAlias !== updated.targetAlias) {
        void refreshDataMart(dataMartId);
      }
      void loadRelationships();
      invalidateBlendableSchema();
      onRelationshipsChanged?.();
    },
    [
      dataMartId,
      relationships,
      loadRelationships,
      refreshDataMart,
      invalidateBlendableSchema,
      onRelationshipsChanged,
    ]
  );

  // Config saves are whole-document PUTs fired from debounced editors (alias, description,
  // field overrides), so two of them can otherwise be in flight at once and land out of
  // order — an older config would then win. One request at a time: while one is in flight the
  // newest config waits its turn, and intermediate ones are dropped because each PUT already
  // carries the complete config.
  const isSavingConfigRef = useRef(false);
  const queuedConfigRef = useRef<BlendedFieldsConfig | null>(null);
  const savedConfigRef = useRef(localBlendedFieldsConfig);
  savedConfigRef.current = localBlendedFieldsConfig;

  const runConfigSaveRef = useRef<(config: BlendedFieldsConfig) => void>(() => {
    /* replaced each render below */
  });
  runConfigSaveRef.current = (config: BlendedFieldsConfig) => {
    isSavingConfigRef.current = true;
    void dataMartRelationshipService
      .updateBlendedFieldsConfig(dataMartId, config, { skipLoadingIndicator: true })
      .then(response => {
        // A newer config is already queued — only the last response describes the saved state.
        if (queuedConfigRef.current) return;
        void syncDataMartFromResponse(response);
        invalidateBlendableSchema();
      })
      .catch(() => {
        toast.error('Failed to save changes');
        // The optimistic value must not keep looking saved: fall back to the last state the
        // server confirmed, unless a newer edit is already on its way.
        if (!queuedConfigRef.current) {
          setLocalConfig(savedConfigRef.current);
          localConfigRef.current = savedConfigRef.current;
        }
      })
      .finally(() => {
        isSavingConfigRef.current = false;
        const queued = queuedConfigRef.current;
        if (queued) {
          queuedConfigRef.current = null;
          runConfigSaveRef.current(queued);
        }
      });
  };

  const saveConfigAndRefresh = useCallback((newConfig: BlendedFieldsConfig) => {
    setLocalConfig(newConfig);
    // Kept in step synchronously: back-to-back edits read this ref to build the next config,
    // and the effect that mirrors state into it runs only after the re-render.
    localConfigRef.current = newConfig;
    if (isSavingConfigRef.current) {
      queuedConfigRef.current = newConfig;
      return;
    }
    runConfigSaveRef.current(newConfig);
  }, []);

  const handleCreated = useCallback(
    (newRelationship: DataMartRelationship) => {
      toast.success('Relationship added');
      setNewlyCreatedId(newRelationship.id);
      setIsAddingNew(false);
      void loadRelationships();
      invalidateBlendableSchema();
      onRelationshipsChanged?.();
    },
    [loadRelationships, invalidateBlendableSchema, onRelationshipsChanged]
  );

  const updateSourceConfig = useCallback(
    (path: string, updater: (current: BlendedSource | undefined) => BlendedSource) => {
      const currentConfig = localConfigRef.current;
      const existingSources = currentConfig.sources.filter(s => s.path !== path);
      const currentSource = currentConfig.sources.find(s => s.path === path);
      saveConfigAndRefresh({
        ...currentConfig,
        sources: [...existingSources, updater(currentSource)],
      });
    },
    [saveConfigAndRefresh]
  );

  const handleSourceAliasChange = useCallback(
    (source: SourceEntry, alias: string) => {
      updateSourceConfig(source.aliasPath, current => ({
        path: source.aliasPath,
        alias,
        ...(current?.isExcluded ? { isExcluded: true } : {}),
        ...(current?.description ? { description: current.description } : {}),
        ...(current?.fields ? { fields: current.fields } : {}),
      }));
    },
    [updateSourceConfig]
  );

  const handleSourceHideChange = useCallback(
    (aliasPath: string, alias: string, isHidden: boolean) => {
      updateSourceConfig(aliasPath, current => ({
        path: aliasPath,
        alias,
        ...(isHidden && { isExcluded: true }),
        ...(current?.description ? { description: current.description } : {}),
        ...(current?.fields && { fields: current.fields }),
      }));
    },
    [updateSourceConfig]
  );

  // An all-whitespace override is a cleared one: the key is removed so the join falls back
  // to the inherited relationship-level description.
  const handleSourceDescriptionChange = useCallback(
    (source: SourceEntry, description: string) => {
      updateSourceConfig(source.aliasPath, current => ({
        path: source.aliasPath,
        alias: current?.alias ?? source.alias,
        ...(current?.isExcluded ? { isExcluded: true } : {}),
        ...(description.trim() !== '' ? { description } : {}),
        ...(current?.fields ? { fields: current.fields } : {}),
      }));
    },
    [updateSourceConfig]
  );

  const handleFieldOverrideChange = useCallback(
    (source: SourceEntry, fieldName: string, override: Partial<BlendedFieldOverride>) => {
      updateSourceConfig(source.aliasPath, current => {
        const currentFields = current?.fields ?? {};
        const merged: BlendedFieldOverride = {
          ...(currentFields[fieldName] ?? {}),
          ...override,
        };

        const cleanOverride = cleanBlendedFieldOverride(merged);

        const newFields: Record<string, BlendedFieldOverride> = {};
        for (const [key, val] of Object.entries(currentFields)) {
          if (key !== fieldName) newFields[key] = val;
        }
        if (Object.keys(cleanOverride).length > 0) {
          newFields[fieldName] = cleanOverride;
        }

        return {
          path: source.aliasPath,
          alias: current?.alias ?? source.alias,
          ...(current?.isExcluded ? { isExcluded: true } : {}),
          ...(current?.description ? { description: current.description } : {}),
          ...(Object.keys(newFields).length > 0 ? { fields: newFields } : {}),
        };
      });
    },
    [updateSourceConfig]
  );

  if (!dataMart) return null;

  const dmTitle = dataMart.title;
  const dmDescription = dataMart.description;
  const dmStatusCode = dataMart.status.code;
  const dmDefinitionType = dataMart.definitionType;

  function renderToolbar() {
    // flex-wrap: the block also renders in narrow layouts (~600px), where the
    // search + selects + view toggle cannot fit one row — controls must stay
    // reachable, so they wrap instead of overflowing.
    return (
      <div className='flex min-w-0 flex-wrap items-center gap-2 pb-4'>
        <SearchInput
          id='search-relationships'
          placeholder='Search data marts'
          value={searchInput}
          onChange={setSearchInput}
          debounceTime={0}
          className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
          aria-label='Search data marts'
        />
        <Select
          value={statusFilter}
          onValueChange={value => {
            handleStatusFilterChange(value as RelationshipStatusFilter);
          }}
        >
          <SelectTrigger className='w-[180px] min-w-[150px]' aria-label='Status'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RELATIONSHIP_STATUS_FILTER_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={showLooped ? 'show' : 'hide'}
          onValueChange={value => {
            handleShowLoopedChange(value === 'show');
          }}
        >
          <SelectTrigger className='w-[220px] min-w-[180px]' aria-label='Looped data marts'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='hide'>Hide looped data marts</SelectItem>
            <SelectItem value='show'>Show looped data marts</SelectItem>
          </SelectContent>
        </Select>
        <div className='ml-auto flex items-center gap-2'>
          {transientRows.length > 0 && (
            <span className='text-muted-foreground mr-2 flex items-center gap-1 text-sm'>
              <GitMerge className='h-3.5 w-3.5' />
              {transientRows.length}
            </span>
          )}
          <Tabs
            value={viewMode}
            onValueChange={v => {
              setViewMode(v as 'table' | 'graph');
            }}
          >
            <TabsList>
              <TabsTrigger value='table' title='Table view'>
                <List className='h-4 w-4' />
                List
              </TabsTrigger>
              <TabsTrigger value='graph' title='Diagram view'>
                <Network className='h-4 w-4' />
                Graph
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    );
  }

  function renderViewContent() {
    if (viewMode === 'graph') {
      return (
        <Suspense fallback={CanvasSuspenseFallback}>
          <RelationshipCanvas
            dataMartId={dataMartId}
            dataMartTitle={dmTitle}
            dataMartDescription={dmDescription}
            dataMartStatus={dmStatusCode}
            dataMartDefinitionType={dmDefinitionType}
            definitionTypes={definitionTypes}
            relationships={relationships}
            relationshipGraph={relationshipGraph}
            connectedFieldCounts={connectedFieldCounts}
            searchQuery={searchQuery}
            showLooped={showLooped}
            statusFilter={statusFilter}
            viewMode={canvasViewMode}
            onViewModeChange={handleCanvasViewModeChange}
            direction={canvasDirection}
            onDirectionChange={handleCanvasDirectionChange}
            showJoinFields={showJoinFields}
            onShowJoinFieldsChange={handleShowJoinFieldsChange}
            objectLabels={objectLabels}
            onObjectLabelsChange={handleObjectLabelsChange}
            fieldsByAliasPath={canvasFieldsByAliasPath}
            onRequestFullscreen={() => {
              setIsFullscreen(true);
            }}
            style={{ height: CONTENT_MIN_H }}
          />
        </Suspense>
      );
    }

    if (isLoadingTransient) {
      return (
        <div className='flex flex-col gap-2 p-4'>
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </div>
      );
    }

    if (filteredRows.length === 0) {
      return (
        <div className='text-muted-foreground px-4 py-6 text-sm'>
          No relationships match your search or filters.
        </div>
      );
    }

    return (
      <div className='flex flex-col gap-2 py-2'>
        {filteredRows.map(row => {
          const rel = row.relationship;
          // Match by aliasPath — two relationships to the same DM must each
          // resolve to their own source entry, otherwise a new relationship
          // inherits the previous one's `isIncluded` / alias overrides.
          const source = sourceList.find(s => s.aliasPath === row.aliasPath) ?? null;
          const isNewlyCreated = rel.id === newlyCreatedId;
          const siblingAliases = siblingAliasesByRelId[rel.id] ?? EMPTY_STRING_ARRAY;

          return (
            <RelationshipAccordionItem
              key={row.rowKey}
              row={row}
              source={source}
              dataMartId={dataMartId}
              storageId={storageId}
              siblingAliases={siblingAliases}
              defaultOpenTab={isNewlyCreated ? 'join-settings' : undefined}
              readOnly={false}
              onDelete={handleDelete}
              onRelationshipUpdated={handleRelationshipUpdated}
              onAliasChange={handleSourceAliasChange}
              onHideForReportingChange={handleSourceHideChange}
              onFieldOverrideChange={handleFieldOverrideChange}
              onDescriptionOverrideChange={handleSourceDescriptionChange}
            />
          );
        })}
      </div>
    );
  }

  function renderContent() {
    if (isLoading) {
      return <Skeleton className='h-[480px] w-full rounded-lg' />;
    }

    if (relationships.length === 0) {
      return (
        <Empty className='gap-4 p-6 md:p-8'>
          <EmptyHeader className='max-w-none'>
            <EmptyMedia variant='icon'>
              <Network />
            </EmptyMedia>
            <EmptyTitle>No joined data marts yet</EmptyTitle>
            <EmptyDescription>
              Join a data mart to extend this one with fields from related sources.
            </EmptyDescription>
          </EmptyHeader>
          {isAddingNew ? (
            <TargetDataMartPicker
              dataMartId={dataMartId}
              storageId={storageId}
              existingRelationships={relationships}
              onCreated={handleCreated}
              onCancel={() => {
                setIsAddingNew(false);
              }}
            />
          ) : (
            <Button
              variant='outline'
              onClick={() => {
                setIsAddingNew(true);
              }}
              className='mt-4'
            >
              <Plus className='h-4 w-4' />
              Join Data Mart
            </Button>
          )}
        </Empty>
      );
    }

    return (
      <>
        {renderToolbar()}
        {renderViewContent()}
        <div>
          {isAddingNew ? (
            <TargetDataMartPicker
              dataMartId={dataMartId}
              storageId={storageId}
              existingRelationships={relationships}
              onCreated={handleCreated}
              onCancel={() => {
                setIsAddingNew(false);
              }}
            />
          ) : (
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setNewlyCreatedId(null);
                setIsAddingNew(true);
              }}
              className='h-12 w-full'
            >
              <Plus className='h-4 w-4' />
              Join Data Mart
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible name='relationships'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Link2}
            tooltip='Business users can add columns from joinable data marts directly into their spreadsheet reports. No hallucinations - row counts remain unchanged'
          >
            Joinable Data Marts
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>{renderContent()}</CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent
          className='flex h-[90vh] max-w-[95vw] flex-col gap-0 p-0 sm:max-w-[95vw]'
          showCloseButton={false}
        >
          <DialogHeader className='flex-row items-center justify-between border-b px-6 py-4'>
            <DialogTitle>Relationship Diagram</DialogTitle>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                setIsFullscreen(false);
              }}
            >
              Close
            </Button>
          </DialogHeader>
          {isFullscreen && (
            <Suspense fallback={CanvasSuspenseFallback}>
              <RelationshipCanvas
                dataMartId={dataMartId}
                dataMartTitle={dataMart.title}
                dataMartDescription={dataMart.description}
                dataMartStatus={dataMart.status.code}
                dataMartDefinitionType={dataMart.definitionType}
                definitionTypes={definitionTypes}
                relationships={relationships}
                relationshipGraph={relationshipGraph}
                connectedFieldCounts={connectedFieldCounts}
                searchQuery={searchQuery}
                showLooped={showLooped}
                statusFilter={statusFilter}
                viewMode={canvasViewMode}
                onViewModeChange={handleCanvasViewModeChange}
                direction={canvasDirection}
                onDirectionChange={handleCanvasDirectionChange}
                showJoinFields={showJoinFields}
                onShowJoinFieldsChange={handleShowJoinFieldsChange}
                objectLabels={objectLabels}
                onObjectLabelsChange={handleObjectLabelsChange}
                fieldsByAliasPath={canvasFieldsByAliasPath}
                className='rounded-none border-0'
                style={{ width: '100%', height: '100%' }}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
