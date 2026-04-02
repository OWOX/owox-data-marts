import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { GitMerge, Plus, List } from 'lucide-react';
import { Skeleton } from '@owox/ui/components/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@owox/ui/components/empty';
import { Button } from '../../../../../shared/components/Button';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardHeaderActions,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../../shared/components/CollapsibleCard';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import type { DataMartContextType } from '../../model/context/types';
import { RelationshipCanvas } from './RelationshipCanvas';
import { RelationshipList } from './RelationshipList';
import { RelationshipDialog } from './RelationshipDialog';

export function DataMartRelationshipsContent() {
  const { dataMart } = useOutletContext<DataMartContextType>();

  const [relationships, setRelationships] = useState<DataMartRelationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<DataMartRelationship | null>(null);

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
          <CollapsibleCardHeaderActions>
            <Button
              variant='default'
              size='sm'
              onClick={() => {
                setEditingRelationship(null);
                setIsDialogOpen(true);
              }}
            >
              <Plus className='mr-1 h-4 w-4' />
              Add Relationship
            </Button>
          </CollapsibleCardHeaderActions>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='bg-background rounded-md'>
            {isLoading ? (
              <div className='flex flex-col gap-2'>
                <Skeleton className='h-16 w-full' />
                <Skeleton className='h-16 w-full' />
              </div>
            ) : (
              <RelationshipList
                relationships={relationships}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </div>
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
