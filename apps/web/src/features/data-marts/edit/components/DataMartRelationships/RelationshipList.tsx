import { useState } from 'react';
import { Badge } from '@owox/ui/components/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@owox/ui/components/empty';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@owox/ui/components/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '@owox/ui/components/tooltip';
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
      <Table>
        <TableHeader className='bg-transparent'>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Target Data Mart</TooltipTrigger>
                <TooltipContent>The data mart this relationship joins to</TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Alias</TooltipTrigger>
                <TooltipContent>
                  Short name used to prefix blended fields in the output schema
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Join Conditions</TooltipTrigger>
                <TooltipContent>
                  Field pairs used to match rows between source and target data marts
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Blendable Fields</TooltipTrigger>
                <TooltipContent>
                  Fields from the target data mart included in the output schema
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background w-24 text-right'>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className='bg-background'>
          {relationships.map(rel => (
            <TableRow
              key={rel.id}
              className='cursor-pointer'
              onClick={() => {
                onEdit(rel);
              }}
            >
              <TableCell className='font-medium'>{rel.targetDataMart.title}</TableCell>
              <TableCell>
                <Badge variant='secondary' className='text-xs'>
                  {rel.targetAlias}
                </Badge>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {rel.joinConditions.length} condition
                {rel.joinConditions.length !== 1 ? 's' : ''}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {rel.blendedFields.length} field
                {rel.blendedFields.length !== 1 ? 's' : ''}
              </TableCell>
              <TableCell className='text-right'>
                <div className='flex items-center justify-end gap-1'>
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
