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
import { TableSelectionCheckbox } from '../../../../../../../shared/components/Table';
import { extractStorageResourceError } from './storage-resource-error.utils';

export type StorageResourceTreeSelectionMode = 'single' | 'multi';

interface StorageResourceTreeProps {
  namespaces: StorageNamespaceNodeDto[] | null;
  namespacesLoading: boolean;
  namespacesError: string | null;
  onRetryNamespaces: () => void;
  loadNamespaceResources: (namespaceId: string) => Promise<StorageResourceLeafDto[]>;
  /** Fires when a resource is picked in single-select mode. */
  onSelectResource?: (resource: StorageResourceLeafDto) => void;
  /** Optional filter passed to label/copy. When undefined, both tables and views are shown. */
  resourceType?: StorageResourceFilter;
  /** Defaults to 'single'. In 'multi' mode, clicking a resource toggles its selection. */
  selectionMode?: StorageResourceTreeSelectionMode;
  /** Set of currently-selected FQNs. Required for visual state in multi mode. */
  selectedFqns?: ReadonlySet<string>;
  /** Fires when a resource is toggled in multi-select mode. */
  onToggleResource?: (resource: StorageResourceLeafDto) => void;
  /** When true and the row is not already selected, the toggle is disabled (selection cap reached). */
  isSelectionFull?: boolean;
  /**
   * When true, the per-namespace resource search input is hidden and the top search input
   * filters BOTH namespaces (by name) and resources (within already-loaded namespaces).
   * Use this in flows where two search inputs add cognitive load.
   */
  singleSearchMode?: boolean;
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
  selectionMode = 'single',
  selectedFqns,
  onToggleResource,
  isSelectionFull = false,
  singleSearchMode = false,
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
            // Clear the fetch guard so the user can retry by collapsing and re-expanding.
            fetchedNamespacesRef.current.delete(namespaceId);
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

  const emptyLabel =
    resourceType === 'VIEW'
      ? 'No views.'
      : resourceType === 'TABLE'
        ? 'No tables.'
        : resourceType === 'TABLE_PATTERN'
          ? 'No sharded tables found in this namespace.'
          : 'No tables or views.';
  const loadingLabel =
    resourceType === 'VIEW'
      ? 'Loading views…'
      : resourceType === 'TABLE'
        ? 'Loading tables…'
        : resourceType === 'TABLE_PATTERN'
          ? 'Loading table patterns…'
          : 'Loading resources…';
  const resourceSearchPlaceholder =
    resourceType === 'VIEW'
      ? 'Search views (group or view name)…'
      : resourceType === 'TABLE'
        ? 'Search tables (group or table name)…'
        : resourceType === 'TABLE_PATTERN'
          ? 'Search table patterns (group or prefix)…'
          : 'Search resources (group or name)…';
  const resourceSearchAriaLabel =
    resourceType === 'VIEW'
      ? 'views'
      : resourceType === 'TABLE'
        ? 'tables'
        : resourceType === 'TABLE_PATTERN'
          ? 'table patterns'
          : 'resources';

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
      if (id.includes(query) || label.includes(query)) return true;
      // In single-search mode the top input also acts as a resource filter; keep a namespace
      // visible if it has loaded resources whose names match the query — that way the user
      // can find a table even when its parent namespace name doesn't contain the term.
      if (!singleSearchMode) return false;
      const loaded = resourcesByNamespace[ns.id]?.data;
      if (!loaded) return false;
      return loaded.some(resource => {
        const rid = resource.id.toLowerCase();
        const rgroup = resource.groupId.toLowerCase();
        return rid.includes(query) || rgroup.includes(query) || `${rgroup}.${rid}`.includes(query);
      });
    });
  }, [sortedNamespaces, namespaceFilter, singleSearchMode, resourcesByNamespace]);

  const hasAnyNamespaces = (sortedNamespaces?.length ?? 0) > 0;

  return (
    <div className='flex flex-col gap-2'>
      {hasAnyNamespaces && (
        <div className='relative'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2' />
          <Input
            type='search'
            placeholder={
              singleSearchMode
                ? 'Search projects, datasets, or tables…'
                : `Search namespaces (${String(sortedNamespaces?.length ?? 0)})…`
            }
            value={namespaceFilter}
            onChange={event => {
              setNamespaceFilter(event.target.value);
            }}
            className='pl-8'
            aria-label={singleSearchMode ? 'Search resources' : 'Search namespaces'}
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
                const resourcesState = resourcesByNamespace[ns.id];
                // In single-search mode, when the user is typing AND a namespace already has
                // its resources loaded, auto-expand it so the matching tables become visible
                // without another click. We deliberately do NOT trigger fetches on un-loaded
                // namespaces (could fan out to many slow API calls); the user expands those
                // explicitly to drill in.
                const isFilteringGlobally = singleSearchMode && namespaceFilter.trim().length > 0;
                const nsExpanded =
                  expandedNamespaces.has(ns.id) ||
                  (isFilteringGlobally && resourcesState?.data != null);
                const resourceFilter = singleSearchMode
                  ? namespaceFilter
                  : (resourceFilterByNamespace[ns.id] ?? '');
                return (
                  <li key={ns.id}>
                    <button
                      type='button'
                      className='hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors'
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
                            {!singleSearchMode && (
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
                                  aria-label={`Search ${resourceSearchAriaLabel} in ${ns.id}`}
                                />
                              </div>
                            )}
                            <GroupedResources
                              namespaceId={ns.id}
                              resources={resourcesState.data}
                              filter={resourceFilter}
                              expandedGroupKeys={expandedGroupKeys}
                              onToggleGroup={toggleGroup}
                              onSelectResource={onSelectResource}
                              selectionMode={selectionMode}
                              selectedFqns={selectedFqns}
                              onToggleResource={onToggleResource}
                              isSelectionFull={isSelectionFull}
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
  onSelectResource?: (resource: StorageResourceLeafDto) => void;
  selectionMode: StorageResourceTreeSelectionMode;
  selectedFqns?: ReadonlySet<string>;
  onToggleResource?: (resource: StorageResourceLeafDto) => void;
  isSelectionFull: boolean;
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
  selectionMode,
  selectedFqns,
  onToggleResource,
  isSelectionFull,
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
              className='hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors'
              onClick={() => {
                onToggleGroup(namespaceId, groupId);
              }}
              aria-expanded={groupExpanded}
            >
              {groupExpanded ? (
                <ChevronDown className='text-muted-foreground size-4 shrink-0' />
              ) : (
                <ChevronRight className='text-muted-foreground size-4 shrink-0' />
              )}
              <FolderOpen className='text-muted-foreground size-4 shrink-0' />
              <span className='truncate' title={groupId}>
                {groupId}
              </span>
              <span className='text-muted-foreground ml-auto shrink-0 text-xs tabular-nums'>
                {groupItems.length}
              </span>
            </button>
            {groupExpanded &&
              groupItems.map(resource => {
                const isSelected = selectedFqns?.has(resource.fullyQualifiedName) ?? false;
                const isMulti = selectionMode === 'multi';
                const disabled = isMulti && !isSelected && isSelectionFull;
                const handleClick = () => {
                  if (isMulti) {
                    if (disabled) return;
                    onToggleResource?.(resource);
                    return;
                  }
                  onSelectResource?.(resource);
                };
                return (
                  <button
                    key={resource.fullyQualifiedName}
                    type='button'
                    role={isMulti ? 'checkbox' : undefined}
                    aria-checked={isMulti ? isSelected : undefined}
                    aria-disabled={disabled || undefined}
                    className={`hover:bg-accent flex w-full items-center gap-2.5 rounded text-left transition-colors ${
                      isMulti ? 'py-1.5 pr-2 pl-7' : 'py-1 pr-2 pl-7'
                    } ${isMulti && isSelected ? 'bg-accent/50' : ''} ${
                      disabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : ''
                    }`}
                    onClick={handleClick}
                    disabled={disabled}
                    title={resource.fullyQualifiedName}
                  >
                    {isMulti && (
                      <TableSelectionCheckbox
                        presentationOnly
                        checked={isSelected}
                        checkIconClassName='size-3 text-white'
                      />
                    )}
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
                );
              })}
          </div>
        );
      })}
    </>
  );
});

function makeGroupKey(namespaceId: string, groupId: string): string {
  return `${namespaceId}\0${groupId}`;
}
