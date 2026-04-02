import { useState } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@owox/ui/components/accordion';
import { Badge } from '@owox/ui/components/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@owox/ui/components/empty';
import { Separator } from '@owox/ui/components/separator';
import { GitMerge, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

interface RelationshipListProps {
  relationships: DataMartRelationship[];
  onEdit: (relationship: DataMartRelationship) => void;
  onDelete: (id: string) => Promise<void>;
}

export function RelationshipList({ relationships, onEdit, onDelete }: RelationshipListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (relationships.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <GitMerge />
          </EmptyMedia>
          <EmptyTitle>No relationships yet</EmptyTitle>
          <EmptyDescription>
            Add a relationship to blend fields from another Data Mart into this one.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await onDelete(deletingId);
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  return (
    <>
      <Accordion type='multiple' className='rounded-lg border'>
        {relationships.map((rel, index) => (
          <AccordionItem key={rel.id} value={rel.id}>
            <AccordionTrigger className='px-4 hover:no-underline'>
              <div className='flex flex-1 items-center gap-3 text-left'>
                <div className='flex flex-col gap-1'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-medium'>{rel.targetDataMart.title}</span>
                    <Badge variant='secondary' className='text-xs'>
                      {rel.targetAlias}
                    </Badge>
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {rel.joinConditions.length} join condition
                    {rel.joinConditions.length !== 1 ? 's' : ''} &middot; {rel.blendedFields.length}{' '}
                    blended field
                    {rel.blendedFields.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className='mr-2 ml-auto flex items-center gap-1'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={e => {
                      e.stopPropagation();
                      onEdit(rel);
                    }}
                    aria-label='Edit relationship'
                  >
                    <Pencil className='h-3.5 w-3.5' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={e => {
                      e.stopPropagation();
                      setDeletingId(rel.id);
                    }}
                    aria-label='Delete relationship'
                    className='text-destructive hover:text-destructive'
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                  </Button>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className='px-4'>
              <div className='grid gap-4 pt-2 md:grid-cols-2'>
                {/* Join Conditions */}
                <div>
                  <p className='text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase'>
                    Join Conditions
                  </p>
                  <div className='flex flex-col gap-1.5'>
                    {rel.joinConditions.map((cond, i) => (
                      <div key={i} className='flex items-center gap-2 text-sm'>
                        <code className='bg-muted rounded px-1.5 py-0.5 text-xs'>
                          {cond.sourceFieldName}
                        </code>
                        <span className='text-muted-foreground text-xs'>=</span>
                        <code className='bg-muted rounded px-1.5 py-0.5 text-xs'>
                          {cond.targetFieldName}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Blended Fields */}
                <div>
                  <p className='text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase'>
                    Blended Fields
                  </p>
                  <div className='flex flex-col gap-1.5'>
                    {rel.blendedFields.map(field => (
                      <div key={field.targetFieldName} className='flex items-center gap-2 text-sm'>
                        <code className='bg-muted rounded px-1.5 py-0.5 text-xs'>
                          {field.outputAlias || field.targetFieldName}
                        </code>
                        <Badge variant='outline' className='text-xs'>
                          {field.aggregateFunction}
                        </Badge>
                        {field.isHidden && (
                          <Badge variant='secondary' className='text-xs'>
                            hidden
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {index < relationships.length - 1 && <Separator className='mt-4' />}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <ConfirmationDialog
        open={deletingId !== null}
        onOpenChange={open => {
          if (!open) setDeletingId(null);
        }}
        title='Delete Relationship'
        description='Are you sure you want to delete this relationship? This action cannot be undone.'
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        cancelLabel='Cancel'
        variant='destructive'
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
      />
    </>
  );
}
