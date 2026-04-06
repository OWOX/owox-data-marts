import { SearchInput } from '@owox/ui/components/common/search-input';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { Skeleton } from '@owox/ui/components/skeleton';
import { GitMerge, List, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export function DataMartRelationshipsContent() {
  const { dataMart } = useOutletContext<DataMartContextType>();

  const [relationships, setRelationships] = useState<DataMartRelationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<DataMartRelationship | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const dataMartId = dataMart?.id ?? '';
  const storageId = dataMart?.storage.id ?? '';

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
        throw new Error('Delete failed');
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

  const filteredRelationships = useMemo(() => {
    if (!searchQuery) return relationships;
    const query = searchQuery.toLowerCase();
    return relationships.filter(
      rel =>
        rel.targetDataMart.title.toLowerCase().includes(query) ||
        rel.targetAlias.toLowerCase().includes(query)
    );
  }, [relationships, searchQuery]);

  if (!dataMart) return null;

  return (
    <div className='flex flex-col gap-4'>
      {/* Diagram */}
      <CollapsibleCard collapsible name='relationship-diagram'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={GitMerge}
            tooltip='Visual diagram of data mart relationships'
          >
            Diagram
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='bg-background rounded-md'>
            {isLoading ? (
              <Skeleton className='h-[480px] w-full rounded-lg' />
            ) : relationships.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <GitMerge />
                  </EmptyMedia>
                  <EmptyTitle>No relationships yet</EmptyTitle>
                  <EmptyDescription>
                    Add a relationship to see how your data marts connect to each other.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <RelationshipCanvas
                dataMartId={dataMartId}
                dataMartTitle={dataMart.title}
                dataMartDescription={dataMart.description}
                dataMartStatus={dataMart.status.code}
                relationships={relationships}
                onRelationshipSelect={handleEdit}
              />
            )}
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>

      {/* List */}
      <CollapsibleCard collapsible name='relationship-list'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={List}
            tooltip='List of all relationships for this data mart'
          >
            Relationships
            {relationships.length > 0 && (
              <span className='bg-muted text-muted-foreground ml-2 rounded-full px-2 py-0.5 text-xs font-normal'>
                {relationships.length}
              </span>
            )}
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {isLoading ? (
            <div className='flex flex-col gap-2'>
              <Skeleton className='h-16 w-full' />
              <Skeleton className='h-16 w-full' />
            </div>
          ) : (
            <>
              <div className='mb-4 flex items-center justify-between gap-2'>
                <SearchInput
                  id='search-relationships'
                  placeholder='Search relationships'
                  value={searchQuery}
                  onChange={setSearchQuery}
                  className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
                  aria-label='Search relationships'
                />
                <Button
                  variant='outline'
                  onClick={() => {
                    setEditingRelationship(null);
                    setIsDialogOpen(true);
                  }}
                >
                  <Plus className='h-4 w-4' />
                  Add Relationship
                </Button>
              </div>
              <RelationshipList
                relationships={filteredRelationships}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </>
          )}
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>

      {/* Add / Edit Dialog */}
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
