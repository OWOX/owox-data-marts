import { Badge } from '@owox/ui/components/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { GitMerge, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { UserReference } from '../../../../../shared/components/UserReference';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';

interface RelationshipListProps {
  relationships: DataMartRelationship[];
  onEdit: (relationship: DataMartRelationship) => void;
  onDelete: (id: string) => Promise<void>;
}

export function RelationshipList({ relationships, onEdit, onDelete }: RelationshipListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteConfirm() {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await onDelete(deletingId);
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  }

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

  return (
    <>
      <Table>
        <TableHeader className='bg-transparent'>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Data Mart</TooltipTrigger>
                <TooltipContent>The related data mart this relationship joins to</TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Field Prefix</TooltipTrigger>
                <TooltipContent>
                  Short name used to prefix blended fields in the output schema
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Join Fields</TooltipTrigger>
                <TooltipContent>
                  Field pairs used to match rows between the source and related data marts
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background'>
              <Tooltip>
                <TooltipTrigger className='cursor-default'>Blendable Fields</TooltipTrigger>
                <TooltipContent>
                  Fields from the related data mart available in the output schema
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background'>Created At</TableHead>
            <TableHead className='bg-secondary dark:bg-background'>Created By</TableHead>
            <TableHead className='bg-secondary dark:bg-background w-12' />
          </TableRow>
        </TableHeader>
        <TableBody className='bg-background'>
          {relationships.map(rel => (
            <TableRow
              key={rel.id}
              className='group cursor-pointer'
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
                {rel.joinConditions.length} {rel.joinConditions.length !== 1 ? 'pairs' : 'pair'}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {rel.blendedFields.length} field
                {rel.blendedFields.length !== 1 ? 's' : ''}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {new Intl.DateTimeFormat('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                }).format(new Date(rel.createdAt))}
              </TableCell>
              <TableCell>
                {rel.createdByUser ? (
                  <UserReference userProjection={rel.createdByUser} />
                ) : (
                  <span className='text-muted-foreground'>-</span>
                )}
              </TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={e => {
                        e.stopPropagation();
                        setDeletingId(rel.id);
                      }}
                      aria-label='Delete relationship'
                      className='text-destructive hover:text-destructive cursor-pointer opacity-0 transition-opacity group-hover:opacity-100'
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete relationship</TooltipContent>
                </Tooltip>
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
