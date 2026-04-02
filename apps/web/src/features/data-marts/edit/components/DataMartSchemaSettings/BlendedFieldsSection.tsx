import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, GitMerge } from 'lucide-react';
import { SearchInput } from '@owox/ui/components/common/search-input';
import { Button } from '@owox/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { BlendableSchema, BlendedField } from '../../../shared/types/relationship.types';
import { Skeleton } from '@owox/ui/components/skeleton';

interface BlendedFieldsSectionProps {
  dataMartId: string;
}

export function BlendedFieldsSection({ dataMartId }: BlendedFieldsSectionProps) {
  const [schema, setSchema] = useState<BlendableSchema | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  useEffect(() => {
    if (!dataMartId) return;

    setIsLoading(true);
    dataMartRelationshipService
      .getBlendableSchema(dataMartId)
      .then(result => {
        setSchema(result);
      })
      .catch(() => {
        setSchema(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [dataMartId]);

  const filteredFields = useMemo(() => {
    if (!schema) return [];
    if (!filterValue.trim()) return schema.blendedFields;
    const query = filterValue.toLowerCase();
    return schema.blendedFields.filter(
      (field: BlendedField) =>
        field.sourceDataMartTitle.toLowerCase().includes(query) ||
        field.targetAlias.toLowerCase().includes(query) ||
        field.originalFieldName.toLowerCase().includes(query) ||
        field.name.toLowerCase().includes(query) ||
        field.type.toLowerCase().includes(query)
    );
  }, [schema, filterValue]);

  if (isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
      </div>
    );
  }

  if (!schema || schema.blendedFields.length === 0) {
    return null;
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <SearchInput
            id='blended-fields-search'
            placeholder='Search fields'
            value={filterValue}
            onChange={setFilterValue}
            className='border-muted dark:border-muted/50 rounded-md border bg-white pl-8 text-sm dark:bg-white/4 dark:hover:bg-white/8'
            aria-label='Search blended fields'
          />
        </div>
        <div className='flex items-center gap-3'>
          <div className='flex items-center gap-1'>
            <Tooltip>
              <TooltipTrigger asChild>
                <CircleCheck className='h-4 w-4 text-green-500' />
              </TooltipTrigger>
              <TooltipContent>Connected</TooltipContent>
            </Tooltip>
            <span className='text-sm font-medium text-gray-500'>{schema.blendedFields.length}</span>
          </div>
          <Button variant='outline' size='sm' asChild>
            <Link to='../relationships'>
              <GitMerge className='mr-1 h-3.5 w-3.5' />
              Go to Relationships
            </Link>
          </Button>
        </div>
      </div>

      <div className='w-full'>
        <Table className='w-full table-auto'>
          <TableHeader className='bg-transparent'>
            <TableRow className='hover:bg-transparent'>
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ width: 36, whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span></span>
                  </TooltipTrigger>
                  <TooltipContent>Field connection status</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>Source DM</span>
                  </TooltipTrigger>
                  <TooltipContent>Title of the related data mart</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>DM Alias</span>
                  </TooltipTrigger>
                  <TooltipContent>Alias used for the related data mart in blending</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>Field</span>
                  </TooltipTrigger>
                  <TooltipContent>Original field name in the source data mart</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>Output Name</span>
                  </TooltipTrigger>
                  <TooltipContent>Name of the field in the blended output schema</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>Type</span>
                  </TooltipTrigger>
                  <TooltipContent>Data type of the field</TooltipContent>
                </Tooltip>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className='border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            {filteredFields.map((field: BlendedField) => (
              <TableRow key={field.name}>
                <TableCell
                  className='bg-background dark:bg-muted'
                  style={{ paddingTop: 8, paddingBottom: 8 }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleCheck className='h-4 w-4 text-green-500' />
                    </TooltipTrigger>
                    <TooltipContent>Connected</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell
                  className='bg-background dark:bg-muted'
                  style={{ paddingTop: 8, paddingBottom: 8 }}
                >
                  {field.sourceDataMartTitle}
                </TableCell>
                <TableCell
                  className='bg-background text-muted-foreground dark:bg-muted font-mono text-xs'
                  style={{ paddingTop: 8, paddingBottom: 8 }}
                >
                  {field.targetAlias}
                </TableCell>
                <TableCell
                  className='bg-background dark:bg-muted font-mono text-xs'
                  style={{ paddingTop: 8, paddingBottom: 8 }}
                >
                  {field.originalFieldName}
                </TableCell>
                <TableCell
                  className='bg-background dark:bg-muted font-mono text-xs'
                  style={{ paddingTop: 8, paddingBottom: 8 }}
                >
                  {field.name}
                </TableCell>
                <TableCell
                  className='bg-background text-muted-foreground dark:bg-muted'
                  style={{ paddingTop: 8, paddingBottom: 8 }}
                >
                  {field.type}
                </TableCell>
              </TableRow>
            ))}
            {filteredFields.length === 0 && filterValue && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='text-center text-gray-400'
                  style={{ whiteSpace: 'nowrap' }}
                >
                  No fields matching &ldquo;{filterValue}&rdquo;
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
