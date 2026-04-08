import { Fragment, useEffect, useMemo, useState } from 'react';
import { CircleCheck, Combine, MoreHorizontal } from 'lucide-react';
import { SearchInput } from '@owox/ui/components/common/search-input';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@owox/ui/components/empty';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@owox/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { BlendableSchema, BlendedField } from '../../../shared/types/relationship.types';
import { Skeleton } from '@owox/ui/components/skeleton';

type ColumnId = 'name' | 'type' | 'alias' | 'description';

const TOGGLEABLE_COLUMNS: { id: ColumnId; title: string; tooltip: string }[] = [
  {
    id: 'name',
    title: 'Name',
    tooltip: 'Field name in the blended output schema',
  },
  { id: 'type', title: 'Type', tooltip: 'Data type of the field' },
  { id: 'alias', title: 'Alias', tooltip: 'Alternative name for the field' },
  { id: 'description', title: 'Description', tooltip: 'Field description' },
];

const CELL_CLASSES: Record<ColumnId, string> = {
  name: 'bg-background dark:bg-muted font-mono text-xs',
  type: 'bg-background text-muted-foreground dark:bg-muted',
  alias: 'bg-background text-muted-foreground dark:bg-muted',
  description: 'bg-background text-muted-foreground dark:bg-muted',
};

function getFieldValue(field: BlendedField, columnId: ColumnId): string {
  switch (columnId) {
    case 'name':
      return field.name;
    case 'type':
      return field.type;
    case 'alias':
      return field.alias || '-';
    case 'description':
      return field.description || '-';
  }
}

interface BlendedFieldGroup {
  sourceRelationshipId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  fields: BlendedField[];
}

interface BlendedFieldsSectionProps {
  dataMartId: string;
}

export function BlendedFieldsSection({ dataMartId }: BlendedFieldsSectionProps) {
  const [schema, setSchema] = useState<BlendableSchema | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnId, boolean>>({
    name: true,
    type: true,
    alias: true,
    description: true,
  });

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

  const groupedFields = useMemo(() => {
    if (!schema) return [];

    const fields = filterValue.trim()
      ? schema.blendedFields.filter((field: BlendedField) => {
          const query = filterValue.toLowerCase();
          return (
            field.sourceDataMartTitle.toLowerCase().includes(query) ||
            field.targetAlias.toLowerCase().includes(query) ||
            field.originalFieldName.toLowerCase().includes(query) ||
            field.name.toLowerCase().includes(query) ||
            field.type.toLowerCase().includes(query) ||
            field.alias.toLowerCase().includes(query)
          );
        })
      : schema.blendedFields;

    const groupMap = new Map<string, BlendedFieldGroup>();
    for (const field of fields) {
      let group = groupMap.get(field.sourceRelationshipId);
      if (!group) {
        group = {
          sourceRelationshipId: field.sourceRelationshipId,
          sourceDataMartTitle: field.sourceDataMartTitle,
          targetAlias: field.targetAlias,
          fields: [],
        };
        groupMap.set(field.sourceRelationshipId, group);
      }
      group.fields.push(field);
    }
    return Array.from(groupMap.values());
  }, [schema, filterValue]);

  const visibleColumns = TOGGLEABLE_COLUMNS.filter(col => columnVisibility[col.id]);
  const visibleColumnCount = 1 + visibleColumns.length + 1;

  const toggleColumn = (id: ColumnId) => {
    setColumnVisibility(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const cellStyle: React.CSSProperties = { whiteSpace: 'pre', paddingTop: 8, paddingBottom: 8 };

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
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Combine />
          </EmptyMedia>
          <EmptyTitle>No blendable fields yet</EmptyTitle>
          <EmptyDescription>
            Add relationships to blend fields from other Data Marts into this one.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent />
      </Empty>
    );
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
        </div>
      </div>

      <div className='max-h-[400px] overflow-auto'>
        <table className='w-full table-auto caption-bottom text-sm'>
          <TableHeader className='bg-secondary dark:bg-background sticky top-0 z-10'>
            <TableRow className='hover:bg-transparent'>
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ width: 56, paddingLeft: 36, whiteSpace: 'nowrap', cursor: 'default' }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span></span>
                  </TooltipTrigger>
                  <TooltipContent>Field connection status</TooltipContent>
                </Tooltip>
              </TableHead>
              {visibleColumns.map(col => (
                <TableHead
                  key={col.id}
                  className='bg-secondary dark:bg-background'
                  style={{ whiteSpace: 'nowrap', cursor: 'default' }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{col.title}</span>
                    </TooltipTrigger>
                    <TooltipContent>{col.tooltip}</TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
              <TableHead
                className='bg-secondary dark:bg-background'
                style={{ width: 40, cursor: 'default' }}
              >
                <div className='text-right'>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant='ghost'
                        className='dm-card-table-body-row-actionbtn'
                        aria-label='Toggle columns'
                      >
                        <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      {TOGGLEABLE_COLUMNS.map(col => (
                        <DropdownMenuCheckboxItem
                          key={col.id}
                          checked={columnVisibility[col.id]}
                          onCheckedChange={() => {
                            toggleColumn(col.id);
                          }}
                        >
                          {col.title}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className='border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            {groupedFields.map(group => (
              <Fragment key={group.sourceRelationshipId}>
                <TableRow className='h-12 hover:bg-transparent'>
                  <TableCell
                    colSpan={visibleColumnCount}
                    className='bg-secondary/50 dark:bg-muted/50 border-t'
                    style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 24 }}
                  >
                    <span className='text-sm font-semibold'>{group.sourceDataMartTitle}</span>
                    <span className='text-muted-foreground ml-2 font-mono text-xs'>
                      {group.targetAlias}
                    </span>
                    <span className='text-muted-foreground ml-2 text-xs'>
                      · {group.fields.length} {group.fields.length === 1 ? 'field' : 'fields'}
                    </span>
                  </TableCell>
                </TableRow>
                {group.fields.map((field: BlendedField) => (
                  <TableRow key={field.name} className='h-12'>
                    <TableCell
                      className='bg-background dark:bg-muted'
                      style={{ ...cellStyle, paddingLeft: 24 }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <CircleCheck className='h-5 w-5 text-green-500' />
                        </TooltipTrigger>
                        <TooltipContent>Connected</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    {visibleColumns.map(col => (
                      <TableCell key={col.id} className={CELL_CLASSES[col.id]} style={cellStyle}>
                        {getFieldValue(field, col.id)}
                      </TableCell>
                    ))}
                    <TableCell
                      className='bg-background dark:bg-muted'
                      style={{ ...cellStyle, width: 40 }}
                    />
                  </TableRow>
                ))}
              </Fragment>
            ))}
            {groupedFields.length === 0 && filterValue && (
              <TableRow>
                <TableCell
                  colSpan={visibleColumnCount}
                  className='text-center text-gray-400'
                  style={{ whiteSpace: 'nowrap' }}
                >
                  No fields matching &ldquo;{filterValue}&rdquo;
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
