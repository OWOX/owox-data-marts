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
import { GitMerge, List, Network, Plus, Route } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useDataMartContext } from '../../model/context/useDataMartContext';
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
  BlendableSchema,
  DataMartRelationship,
} from '../../../shared/types/relationship.types';

import { RelationshipCanvas } from './RelationshipCanvas';
import { RelationshipDialog } from './RelationshipDialog';
import { RelationshipList } from './RelationshipList';
import { useTransientRelationships } from './useTransientRelationships';

const VIEW_MODE_KEY = 'relationship-view-mode';
const SHOW_TRANSITIVE_KEY = 'relationship-show-transitive';
const CONTENT_MIN_H = 480;

export function DataMartRelationshipsContent() {
  const { dataMart } = useDataMartContext();

  const [relationships, setRelationships] = useState<DataMartRelationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<DataMartRelationship | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, []);
  const [viewMode, setViewMode] = useState<'table' | 'graph'>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === 'graph' ? 'graph' : 'table';
  });
  const [showTransient, setShowTransient] = useState(
    () => localStorage.getItem(SHOW_TRANSITIVE_KEY) === 'true'
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dataMartId = dataMart?.id ?? '';
  const storageId = dataMart?.storage.id ?? '';

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(SHOW_TRANSITIVE_KEY, String(showTransient));
  }, [showTransient]);

  const loadRelationships = useCallback(async () => {
    if (!dataMartId) return;
    setIsLoading(true);
    try {
      const data = await dataMartRelationshipService.getRelationships(dataMartId);
      setRelationships(data);
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

  useEffect(() => {
    if (!dataMartId) return;
    dataMartRelationshipService
      .getBlendableSchema(dataMartId)
      .then(data => {
        setBlendableSchema(data);
      })
      .catch(() => {
        setBlendableSchema(null);
      });
  }, [dataMartId, relationships]);

  const connectedFieldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!blendableSchema) return counts;
    const topLevelSets = new Map<string, Set<string>>();
    for (const field of blendableSchema.blendedFields) {
      if (field.type === 'UNKNOWN') continue;
      const relId = field.sourceRelationshipId;
      if (!topLevelSets.has(relId)) topLevelSets.set(relId, new Set());
      const set = topLevelSets.get(relId);
      if (set) set.add(field.originalFieldName.split('.')[0]);
    }
    for (const [relId, names] of topLevelSets) {
      counts.set(relId, names.size);
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

  const handleEdit = useCallback((relationship: DataMartRelationship) => {
    setEditingRelationship(relationship);
    setIsDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await dataMartRelationshipService.deleteRelationship(dataMartId, id);
        toast.success('Relationship deleted');
        setRelationships(prev => prev.filter(r => r.id !== id));
      } catch {
        toast.error('Failed to delete relationship');
      }
    },
    [dataMartId]
  );

  const handleDialogClose = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingRelationship(null);
    }
  }, []);

  const handleSaved = useCallback(() => {
    toast.success(editingRelationship ? 'Relationship updated' : 'Relationship added');
    void loadRelationships();
  }, [editingRelationship, loadRelationships]);

  const openAddDialog = useCallback(() => {
    setEditingRelationship(null);
    setIsDialogOpen(true);
  }, []);

  if (!dataMart) return null;

  const dmTitle = dataMart.title;
  const dmDescription = dataMart.description;
  const dmStatusCode = dataMart.status.code;

  function renderToolbar() {
    return (
      <div className='flex items-center justify-between gap-2 pb-4'>
        <SearchInput
          id='search-relationships'
          placeholder='Search relationships'
          value={searchInput}
          onChange={handleSearchChange}
          debounceTime={0}
          className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
          aria-label='Search relationships'
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
            <TabsList className='dark:border-input h-9 border'>
              <TabsTrigger
                value='table'
                className='data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground px-2.5'
                title='Table view'
              >
                <List className='h-4 w-4' />
              </TabsTrigger>
              <TabsTrigger
                value='graph'
                className='data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground px-2.5'
                title='Diagram view'
              >
                <Network className='h-4 w-4' />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant={showTransient ? 'secondary' : 'outline'}
            size='sm'
            onClick={() => {
              setShowTransient(v => !v);
            }}
            className={`h-9 gap-1.5 ${showTransient ? 'ring-ring/30 ring-2' : ''}`}
          >
            <Route className='h-4 w-4' />
            Show transient
          </Button>

          <Button variant='outline' size='sm' className='h-9' onClick={openAddDialog}>
            <Plus className='h-4 w-4' />
            Add Relationship
          </Button>
        </div>
      </div>
    );
  }

  function renderViewContent() {
    if (viewMode === 'graph') {
      return (
        <RelationshipCanvas
          dataMartId={dataMartId}
          dataMartTitle={dmTitle}
          dataMartDescription={dmDescription}
          dataMartStatus={dmStatusCode}
          relationships={relationships}
          onRelationshipSelect={handleEdit}
          searchQuery={searchQuery}
          showTransient={showTransient}
          onRequestFullscreen={() => {
            setIsFullscreen(true);
          }}
          style={{ height: CONTENT_MIN_H }}
        />
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

    return (
      <RelationshipList
        rows={filteredRows}
        onEdit={handleEdit}
        onDelete={handleDelete}
        connectedFieldCounts={connectedFieldCounts}
      />
    );
  }

  function renderContent() {
    if (isLoading) {
      return <Skeleton className='h-[480px] w-full rounded-lg' />;
    }

    if (relationships.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Network />
            </EmptyMedia>
            <EmptyTitle>No relationships yet</EmptyTitle>
            <EmptyDescription>
              Add a relationship to see how your data marts connect to each other.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant='outline' onClick={openAddDialog} className='mt-4'>
            <Plus className='h-4 w-4' />
            Add Relationship
          </Button>
        </Empty>
      );
    }

    return (
      <>
        {renderToolbar()}
        <div className='bg-background overflow-hidden rounded-md'>{renderViewContent()}</div>
      </>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible name='relationships'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Network}
            tooltip='Relationships between this data mart and others'
          >
            Relationships
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
            <RelationshipCanvas
              dataMartId={dataMartId}
              dataMartTitle={dataMart.title}
              dataMartDescription={dataMart.description}
              dataMartStatus={dataMart.status.code}
              relationships={relationships}
              onRelationshipSelect={handleEdit}
              searchQuery={searchQuery}
              showTransient={showTransient}
              className='rounded-none border-0'
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </DialogContent>
      </Dialog>

      <RelationshipDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        dataMartId={dataMartId}
        storageId={storageId}
        relationship={editingRelationship}
        onSaved={handleSaved}
      />
    </div>
  );
}
