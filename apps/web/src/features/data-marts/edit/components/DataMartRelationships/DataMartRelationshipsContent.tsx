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
import { List, Network, Plus, Route } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useOutletContext } from 'react-router-dom';
import { Button } from '../../../../../shared/components/Button';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../../../../shared/components/CollapsibleCard';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import type { DataMartContextType } from '../../model/context/types';
import { RelationshipCanvas } from './RelationshipCanvas';
import { RelationshipDialog } from './RelationshipDialog';
import { RelationshipList } from './RelationshipList';
import { useTransientRelationships } from './useTransientRelationships';

const VIEW_MODE_KEY = 'relationship-view-mode';
const CONTENT_MIN_H = 480;

export function DataMartRelationshipsContent() {
  const { dataMart } = useOutletContext<DataMartContextType>();

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
  const [showTransient, setShowTransient] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dataMartId = dataMart?.id ?? '';
  const storageId = dataMart?.storage.id ?? '';

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

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
            Show transitive
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

    return <RelationshipList rows={filteredRows} onEdit={handleEdit} onDelete={handleDelete} />;
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
            {relationships.length > 0 && (
              <span className='bg-muted text-muted-foreground ml-2 rounded-full px-2 py-0.5 text-xs font-normal'>
                {relationships.length}
              </span>
            )}
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
