import { SearchInput } from '@owox/ui/components/common/search-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@owox/ui/components/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { Skeleton } from '@owox/ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { GitMerge, Link2, List, Network, Plus } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useDataMartContext } from '../../model/context/useDataMartContext';
import { useDebounce } from '../../../../../hooks/useDebounce';
import { BLENDABLE_SCHEMA_QUERY_KEY } from '../../../shared/hooks/useBlendedFieldNames';
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
  BlendableSchema,
  BlendedField,
  BlendedFieldOverride,
  BlendedFieldsConfig,
  BlendedSource,
  DataMartRelationship,
} from '../../../shared/types/relationship.types';

import type { SourceEntry } from './RelationshipAccordionItem';
import { RelationshipAccordionItem } from './RelationshipAccordionItem';
import { TargetDataMartPicker } from './TargetDataMartPicker';
import { useTransientRelationships } from './useTransientRelationships';

// `RelationshipCanvas` pulls in Rete.js and its plugins (~50 kB gzipped).
// Load it only when the user switches to graph view so the default table
// path keeps the main bundle small.
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
            v.isHidden !== undefined || v.aggregateFunction !== undefined || v.alias !== undefined
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

  const [relationships, setRelationships] = useState<DataMartRelationship[]>([]);
  const relationshipsRef = useRef<DataMartRelationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const searchQuery = useDebounce(searchInput, 300);

  const [viewMode, setViewMode] = useState<'table' | 'graph'>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === 'graph' ? 'graph' : 'table';
  });
  const showTransient = true;
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
    relationshipsRef.current = relationships;
  }, [relationships]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const loadRelationships = useCallback(async () => {
    if (!dataMartId) return;
    setIsLoading(true);
    try {
      const data = await dataMartRelationshipService.getRelationships(dataMartId);
      // Sort by createdAt ASC — oldest on top, newest at bottom
      const sorted = [...data].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setRelationships(sorted);
    } catch {
      toast.error('Failed to load relationships');
    } finally {
      setIsLoading(false);
    }
  }, [dataMartId]);

  useEffect(() => {
    void loadRelationships();
  }, [loadRelationships]);

  const [blendableSchema, setBlendableSchema] = useState<BlendableSchema | null>(null);
  // Create + setRelationships can race: both trigger a schema fetch and a slow
  // first response could overwrite a newer one. Discard anything that isn't
  // the latest in-flight request.
  const schemaRequestIdRef = useRef(0);

  const fetchBlendableSchema = useCallback(
    (showLoading = false) => {
      if (!dataMartId) return;
      const requestId = ++schemaRequestIdRef.current;
      if (showLoading) setIsLoading(true);
      dataMartRelationshipService
        .getBlendableSchema(dataMartId)
        .then(data => {
          if (schemaRequestIdRef.current !== requestId) return;
          setBlendableSchema(data);
        })
        .catch(() => {
          if (schemaRequestIdRef.current !== requestId) return;
          setBlendableSchema(null);
        })
        .finally(() => {
          if (showLoading && schemaRequestIdRef.current === requestId) setIsLoading(false);
        });
    },
    [dataMartId]
  );

  useEffect(() => {
    fetchBlendableSchema();
  }, [fetchBlendableSchema, relationships]);

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

  const { rows: transientRows, isLoading: isLoadingTransient } = useTransientRelationships(
    dataMartId,
    dataMart?.title ?? '',
    dataMart?.status.code ?? '',
    relationships,
    showTransient
  );

  const filteredRows = useMemo(() => {
    if (!searchQuery) return transientRows;
    const q = searchQuery.toLowerCase();
    return transientRows.filter(
      row =>
        row.relationship.targetDataMart.title.toLowerCase().includes(q) ||
        row.relationship.targetAlias.toLowerCase().includes(q)
    );
  }, [transientRows, searchQuery]);

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
        await dataMartRelationshipService.deleteRelationship(dataMartId, id);
        toast.success('Relationship deleted');
        setRelationships(prev => prev.filter(r => r.id !== id));
        invalidateBlendableSchema();
        onRelationshipsChanged?.();
      } catch {
        toast.error('Failed to delete relationship');
      }
    },
    [dataMartId, invalidateBlendableSchema, onRelationshipsChanged]
  );

  const handleRelationshipUpdated = useCallback(
    (updated: DataMartRelationship) => {
      toast.success('Relationship updated');
      const prevTargetAlias = relationshipsRef.current.find(r => r.id === updated.id)?.targetAlias;
      setRelationships(prev => prev.map(r => (r.id === updated.id ? updated : r)));
      // Rename cascades paths in blendedFieldsConfig server-side; refetch to avoid overwriting it on next save.
      if (prevTargetAlias !== undefined && prevTargetAlias !== updated.targetAlias) {
        void refreshDataMart(dataMartId);
      }
      invalidateBlendableSchema();
      onRelationshipsChanged?.();
    },
    [dataMartId, refreshDataMart, invalidateBlendableSchema, onRelationshipsChanged]
  );

  const saveConfigAndRefresh = useCallback(
    (newConfig: BlendedFieldsConfig) => {
      setLocalConfig(newConfig);
      void dataMartRelationshipService
        .updateBlendedFieldsConfig(dataMartId, newConfig)
        .then(response => {
          void syncDataMartFromResponse(response);
          fetchBlendableSchema();
          invalidateBlendableSchema();
        });
    },
    [dataMartId, fetchBlendableSchema, invalidateBlendableSchema, syncDataMartFromResponse]
  );

  const handleCreated = useCallback(
    (newRelationship: DataMartRelationship) => {
      toast.success('Relationship added');
      setNewlyCreatedId(newRelationship.id);
      setIsAddingNew(false);
      setRelationships(prev => [...prev, newRelationship]);
      invalidateBlendableSchema();
      onRelationshipsChanged?.();
    },
    [invalidateBlendableSchema, onRelationshipsChanged]
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
        ...(current?.fields && { fields: current.fields }),
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

        const cleanOverride: BlendedFieldOverride = {};
        if (merged.alias !== undefined && merged.alias !== '') cleanOverride.alias = merged.alias;
        if (merged.isHidden !== undefined) cleanOverride.isHidden = merged.isHidden;
        if (merged.aggregateFunction !== undefined) {
          cleanOverride.aggregateFunction = merged.aggregateFunction;
        }

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

  function renderToolbar() {
    return (
      <div className='flex items-center justify-between gap-2 pb-4'>
        <SearchInput
          id='search-relationships'
          placeholder='Search data marts'
          value={searchInput}
          onChange={setSearchInput}
          debounceTime={0}
          className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
          aria-label='Search data marts'
        />
        <div className='flex items-center gap-2'>
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
            relationships={relationships}
            connectedFieldCounts={connectedFieldCounts}
            searchQuery={searchQuery}
            showTransient={showTransient}
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

    if (filteredRows.length === 0 && searchQuery) {
      return (
        <div className='text-muted-foreground px-4 py-6 text-sm'>
          No relationships match your search.
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
        <div className='pt-4'>
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
            tooltip='Joinable data marts connected to this one'
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
                relationships={relationships}
                connectedFieldCounts={connectedFieldCounts}
                searchQuery={searchQuery}
                showTransient={showTransient}
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
