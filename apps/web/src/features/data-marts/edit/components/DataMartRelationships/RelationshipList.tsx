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
import { ExternalLink, GitMerge, Info, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../../shared/components/Button';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { UserReference } from '../../../../../shared/components/UserReference';
import { useProjectRoute } from '../../../../../shared/hooks/useProjectRoute';
import type {
  DataMartRelationship,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';

interface RelationshipListProps {
  rows: TransientRelationshipRow[];
  onEdit: (relationship: DataMartRelationship) => void;
  onDelete: (id: string) => Promise<void>;
  connectedFieldCounts: Map<string, number>;
}

export function RelationshipList({
  rows,
  onEdit,
  onDelete,
  connectedFieldCounts,
}: RelationshipListProps) {
  const { scope } = useProjectRoute();
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

  if (rows.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <GitMerge />
          </EmptyMedia>
          <EmptyTitle>No relationships match your search</EmptyTitle>
          <EmptyDescription>Try a different search term.</EmptyDescription>
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
                <TooltipTrigger className='cursor-default'>Alias</TooltipTrigger>
                <TooltipContent>
                  Alias used to reference this relationship in the output schema
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
            <TableHead className='bg-secondary dark:bg-background cursor-default'>
              Created At
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background cursor-default'>
              Created By
            </TableHead>
            <TableHead className='bg-secondary dark:bg-background w-20' />
          </TableRow>
        </TableHeader>
        <TableBody className='bg-background'>
          {rows.map((row, idx) => {
            const rel = row.relationship;
            const isTransient = row.depth >= 2;
            const topLevelFieldCount = connectedFieldCounts.get(rel.id) ?? 0;

            return (
              <TableRow
                key={`${rel.id}-${idx}`}
                className={isTransient ? 'group cursor-default opacity-60' : 'group cursor-pointer'}
                onClick={
                  isTransient
                    ? undefined
                    : () => {
                        onEdit(rel);
                      }
                }
              >
                <TableCell className='font-medium'>
                  <span
                    className='inline-flex items-center'
                    style={{ paddingLeft: isTransient ? (row.depth - 1) * 16 : 0 }}
                  >
                    {isTransient && (
                      <span className='text-muted-foreground mr-1.5 text-xs'>{'\u21B3'}</span>
                    )}
                    {rel.targetDataMart.title}
                    {(row.isBlocked || rel.targetDataMart.status === 'DRAFT') && (
                      <Badge
                        variant='outline'
                        className='ml-2 border-orange-400 text-[10px] text-orange-500'
                      >
                        {rel.targetDataMart.status === 'DRAFT' ? 'Draft' : 'Blocked'}
                      </Badge>
                    )}
                    {rel.targetDataMart.description && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className='text-muted-foreground ml-1.5 inline-flex cursor-default'
                            onClick={e => {
                              e.stopPropagation();
                            }}
                          >
                            <Info className='h-3.5 w-3.5' />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side='top' className='max-w-xs'>
                          {rel.targetDataMart.description}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant='secondary' className='text-xs'>
                    {rel.targetAlias}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground'>
                  {rel.joinConditions.length} {rel.joinConditions.length !== 1 ? 'pairs' : 'pair'}
                </TableCell>
                <TableCell className='text-muted-foreground'>
                  {topLevelFieldCount} field{topLevelFieldCount !== 1 ? 's' : ''}
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
                  <div className='flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={e => {
                            e.stopPropagation();
                            window.open(
                              scope(`/data-marts/${rel.targetDataMart.id}/data-setup`),
                              '_blank'
                            );
                          }}
                          aria-label='Open data mart'
                          className='cursor-pointer'
                        >
                          <ExternalLink className='h-3.5 w-3.5' />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open data mart</TooltipContent>
                    </Tooltip>
                    {!isTransient && (
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
                            className='text-destructive hover:text-destructive cursor-pointer'
                          >
                            <Trash2 className='h-3.5 w-3.5' />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete relationship</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
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
