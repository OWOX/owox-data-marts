import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FolderOpen,
  Loader2,
  Search,
  Table,
} from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import type {
  StorageNamespaceNodeDto,
  StorageResourceFilter,
  StorageResourceLeafDto,
} from '../../../../../../data-storage/shared/api/types';
import { extractStorageResourceError } from './storage-resource-error.utils';

interface StorageResourceTreeProps {
  namespaces: StorageNamespaceNodeDto[] | null;
  namespacesLoading: boolean;
  namespacesError: string | null;
  onRetryNamespaces: () => void;
  loadNamespaceResources: (namespaceId: string) => Promise<StorageResourceLeafDto[]>;
  onSelectResource: (resource: StorageResourceLeafDto) => void;
  resourceType: StorageResourceFilter;
}

interface ResourcesState {
  loading: boolean;
  error: string | null;
  data: StorageResourceLeafDto[] | null;
}

// Sort helper — "base" sensitivity + numeric so "project-2" comes before "project-10"
// and casing differences don't reshuffle the list on the user.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function StorageResourceTree({
  namespaces,
  namespacesLoading,
  namespacesError,
  onRetryNamespaces,
  loadNamespaceResources,
  onSelectResource,
  resourceType,
}: StorageResourceTreeProps) {
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set());
  const [resourcesByNamespace, setResourcesByNamespace] = useState<
    Record<string, ResourcesState | undefined>
  >({});
  const [namespaceFilter, setNamespaceFilter] = useState('');
  const [resourceFilterByNamespace, setResourceFilterByNamespace] = useState<
    Record<string, string>
  >({});
  // Groups are collapsed by default. Keyed by `${namespaceId}\0${groupId}` to avoid clashes.
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  // Tracks which namespaces have already had a fetch initiated so we don't fire it again.
  // Using a ref (not state) keeps toggleNamespace's deps list minimal — changes here must not
  // force a re-render or recreate the callback.
  const fetchedNamespacesRef = useRef<Set<string>>(new Set());

  const toggleNamespace = useCallback(
    (namespaceId: string) => {
      setExpandedNamespaces(prev => {
        const next = new Set(prev);
        if (next.has(namespaceId)) {
          next.delete(namespaceId);
          return next;
        }
        next.add(namespaceId);
        return next;
      });

      if (!fetchedNamespacesRef.current.has(namespaceId)) {
        fetchedNamespacesRef.current.add(namespaceId);
        setResourcesByNamespace(prev => ({
          ...prev,
          [namespaceId]: { loading: true, error: null, data: null },
        }));
        loadNamespaceResources(namespaceId)
          .then(resources => {
            setResourcesByNamespace(prev => ({
              ...prev,
              [namespaceId]: { loading: false, error: null, data: resources },
            }));
          })
          .catch((error: unknown) => {
            setResourcesByNamespace(prev => ({
              ...prev,
              [namespaceId]: {
                loading: false,
                error: extractStorageResourceError(error),
                data: [],
              },
            }));
          });
      }
    },
    [loadNamespaceResources]
  );

  const toggleGroup = useCallback((namespaceId: string, groupId: string) => {
    const key = makeGroupKey(namespaceId, groupId);
    setExpandedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const emptyLabel = resourceType === 'VIEW' ? 'No views.' : 'No tables.';
  const loadingLabel = resourceType === 'VIEW' ? 'Loading views…' : 'Loading tables…';
  const resourceSearchPlaceholder =
    resourceType === 'VIEW'
      ? 'Search views (group or view name)…'
      : 'Search tables (group or table name)…';

  const sortedNamespaces = useMemo(() => {
    if (!namespaces) return null;
    return namespaces.slice().sort((a, b) => collator.compare(a.id, b.id));
  }, [namespaces]);

  const filteredNamespaces = useMemo(() => {
    if (!sortedNamespaces) return null;
    const query = namespaceFilter.trim().toLowerCase();
    if (!query) return sortedNamespaces;
    return sortedNamespaces.filter(ns => {
      const id = ns.id.toLowerCase();
      const label = ns.label?.toLowerCase() ?? '';
      return id.includes(query) || label.includes(query);
    });
  }, [sortedNamespaces, namespaceFilter]);

  const hasAnyNamespaces = (sortedNamespaces?.length ?? 0) > 0;

  return (
    <div className='flex flex-col gap-2'>
      {hasAnyNamespaces && (
        <div className='relative'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2' />
          <Input
            type='search'
            placeholder={`Search namespaces (${String(sortedNamespaces?.length ?? 0)})…`}
            value={namespaceFilter}
            onChange={event => {
              setNamespaceFilter(event.target.value);
            }}
            className='pl-8'
            aria-label='Search namespaces'
          />
        </div>
      )}
      <div className='max-h-[60vh] overflow-auto rounded-md border p-2 text-sm'>
        {namespacesLoading && (
          <div className='text-muted-foreground flex items-center gap-2 p-3'>
            <Loader2 className='size-4 animate-spin' />
            Loading namespaces…
          </div>
        )}
        {!namespacesLoading && namespacesError && (
          <div className='flex flex-col gap-2 p-3'>
            <div className='text-destructive flex items-center gap-2'>
              <AlertCircle className='size-4' />
              {namespacesError}
            </div>
            <Button type='button' size='sm' variant='outline' onClick={onRetryNamespaces}>
              Retry
            </Button>
          </div>
        )}
        {!namespacesLoading && !namespacesError && sortedNamespaces?.length === 0 && (
          <div className='text-muted-foreground p-3'>
            No namespaces are visible with the storage credentials.
          </div>
        )}
        {!namespacesLoading &&
          !namespacesError &&
          hasAnyNamespaces &&
          filteredNamespaces?.length === 0 && (
            <div className='text-muted-foreground p-3'>
              No namespaces match &ldquo;{namespaceFilter.trim()}&rdquo;.
            </div>
          )}
        {!namespacesLoading &&
          !namespacesError &&
          filteredNamespaces &&
          filteredNamespaces.length > 0 && (
            <ul className='space-y-0.5'>
              {filteredNamespaces.map(ns => {
                const nsExpanded = expandedNamespaces.has(ns.id);
                const resourcesState = resourcesByNamespace[ns.id];
                const resourceFilter = resourceFilterByNamespace[ns.id] ?? '';
                return (
                  <li key={ns.id}>
                    <button
                      type='button'
                      className='hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1 text-left'
                      onClick={() => {
                        toggleNamespace(ns.id);
                      }}
                      aria-expanded={nsExpanded}
                    >
                      {nsExpanded ? (
                        <ChevronDown className='size-4 shrink-0' />
                      ) : (
                        <ChevronRight className='size-4 shrink-0' />
                      )}
                      <Database className='size-4 shrink-0' />
                      <span className='truncate' title={ns.id}>
                        {ns.id}
                        {ns.label && ns.label !== ns.id && (
                          <span className='text-muted-foreground ml-2'>{ns.label}</span>
                        )}
                      </span>
                    </button>
                    {nsExpanded && (
                      <div className='ml-5 border-l pl-2'>
                        {resourcesState?.loading && (
                          <div className='text-muted-foreground flex items-center gap-2 p-1'>
                            <Loader2 className='size-4 animate-spin' />
                            {loadingLabel}
                          </div>
                        )}
                        {resourcesState?.error && (
                          <div className='text-destructive flex items-center gap-2 p-1'>
                            <AlertCircle className='size-4' />
                            {resourcesState.error}
                          </div>
                        )}
                        {resourcesState?.data?.length === 0 && (
                          <div className='text-muted-foreground p-1'>{emptyLabel}</div>
                        )}
                        {resourcesState?.data && resourcesState.data.length > 0 && (
                          <>
                            <div className='relative my-1'>
                              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2' />
                              <Input
                                type='search'
                                placeholder={resourceSearchPlaceholder}
                                value={resourceFilter}
                                onChange={event => {
                                  const value = event.target.value;
                                  setResourceFilterByNamespace(prev => ({
                                    ...prev,
                                    [ns.id]: value,
                                  }));
                                }}
                                className='h-8 pl-7 text-xs'
                                aria-label={`Search ${resourceType === 'VIEW' ? 'views' : 'tables'} in ${ns.id}`}
                              />
                            </div>
                            <GroupedResources
                              namespaceId={ns.id}
                              resources={resourcesState.data}
                              filter={resourceFilter}
                              expandedGroupKeys={expandedGroupKeys}
                              onToggleGroup={toggleGroup}
                              onSelectResource={onSelectResource}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}

interface GroupedResourcesProps {
  namespaceId: string;
  resources: StorageResourceLeafDto[];
  filter: string;
  expandedGroupKeys: Set<string>;
  onToggleGroup: (namespaceId: string, groupId: string) => void;
  onSelectResource: (resource: StorageResourceLeafDto) => void;
}

// Memoized so that typing in the namespace search input does not re-render every
// expanded namespace's resource tree — only the one whose filter actually changed.
const GroupedResources = memo(function GroupedResources({
  namespaceId,
  resources,
  filter,
  expandedGroupKeys,
  onToggleGroup,
  onSelectResource,
}: GroupedResourcesProps) {
  const normalizedFilter = filter.trim().toLowerCase();
  const isFiltering = normalizedFilter.length > 0;

  // Filter first so we only group what we actually render. "group.resource" substring matches
  // support the user pasting or typing a two-part name directly.
  const matchedResources = useMemo(() => {
    if (!isFiltering) return resources;
    return resources.filter(resource => {
      const id = resource.id.toLowerCase();
      const groupId = resource.groupId.toLowerCase();
      return (
        id.includes(normalizedFilter) ||
        groupId.includes(normalizedFilter) ||
        `${groupId}.${id}`.includes(normalizedFilter)
      );
    });
  }, [resources, normalizedFilter, isFiltering]);

  // Group by groupId; sort groups and resources alphabetically for predictable UX.
  const groupedResources = useMemo(() => {
    const grouped = new Map<string, StorageResourceLeafDto[]>();
    for (const resource of matchedResources) {
      const bucket = grouped.get(resource.groupId);
      if (bucket) {
        bucket.push(resource);
      } else {
        grouped.set(resource.groupId, [resource]);
      }
    }
    return Array.from(grouped.entries())
      .map(([groupId, groupResources]) => ({
        groupId,
        resources: groupResources.slice().sort((a, b) => collator.compare(a.id, b.id)),
      }))
      .sort((a, b) => collator.compare(a.groupId, b.groupId));
  }, [matchedResources]);

  if (matchedResources.length === 0) {
    return (
      <div className='text-muted-foreground p-1 text-xs'>
        No matches for &ldquo;{filter.trim()}&rdquo;.
      </div>
    );
  }

  return (
    <>
      {groupedResources.map(({ groupId, resources: groupItems }) => {
        // Auto-expand while filtering so matches are always visible. Otherwise honour the
        // manual toggle — groups start collapsed.
        const groupExpanded =
          isFiltering || expandedGroupKeys.has(makeGroupKey(namespaceId, groupId));
        return (
          <div key={groupId} className='mt-1 first:mt-0'>
            <button
              type='button'
              className='hover:bg-accent text-muted-foreground flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs'
              onClick={() => {
                onToggleGroup(namespaceId, groupId);
              }}
              aria-expanded={groupExpanded}
            >
              {groupExpanded ? (
                <ChevronDown className='size-3.5 shrink-0' />
              ) : (
                <ChevronRight className='size-3.5 shrink-0' />
              )}
              <FolderOpen className='size-3.5 shrink-0' />
              <span className='truncate' title={groupId}>
                {groupId}
              </span>
              <span className='ml-auto shrink-0 text-[11px] tabular-nums'>{groupItems.length}</span>
            </button>
            {groupExpanded &&
              groupItems.map(resource => (
                <button
                  key={resource.fullyQualifiedName}
                  type='button'
                  className='hover:bg-accent flex w-full items-center gap-2 rounded py-1 pr-2 pl-7 text-left'
                  onClick={() => {
                    onSelectResource(resource);
                  }}
                  title={resource.fullyQualifiedName}
                >
                  {resource.type === 'VIEW' ? (
                    <Eye className='size-4 shrink-0' />
                  ) : (
                    <Table className='size-4 shrink-0' />
                  )}
                  <span className='truncate'>{resource.id}</span>
                  <span className='text-muted-foreground ml-auto shrink-0 text-xs'>
                    {resource.type}
                  </span>
                </button>
              ))}
          </div>
        );
      })}
    </>
  );
});

function makeGroupKey(namespaceId: string, groupId: string): string {
  return `${namespaceId}\0${groupId}`;
}
