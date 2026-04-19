import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EyeOff, Info, MoreHorizontal, Eye, Search } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@owox/ui/components/table';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import {
  AGGREGATE_FUNCTIONS,
  type AggregateFunction,
  type BlendedField,
  type BlendedFieldOverride,
} from '../../../shared/types/relationship.types';
import { useDebounce } from '../../../../../hooks/useDebounce';

type FilterMode = 'all' | 'visible' | 'hidden';

interface SourceFieldsTableProps {
  fields: BlendedField[];
  onFieldOverrideChange: (fieldName: string, override: Partial<BlendedFieldOverride>) => void;
  /**
   * Optional slot rendered to the left of the filtering block in the toolbar.
   * Used by RelationshipAccordionItem to render the Output Alias input in the
   * same row as the field filters, matching the Join Settings layout.
   */
  leadingToolbar?: ReactNode;
}

function FieldAliasInput({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const debouncedValue = useDebounce(value, 500);
  const lastSaved = useRef(initialValue);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (debouncedValue !== lastSaved.current) {
      onSaveRef.current(debouncedValue);
      lastSaved.current = debouncedValue;
    }
  }, [debouncedValue]);

  return (
    <Input
      value={value}
      onChange={e => {
        setValue(e.target.value);
      }}
      onBlur={() => {
        if (value !== lastSaved.current) {
          onSave(value);
          lastSaved.current = value;
        }
      }}
      className='h-8 w-full'
    />
  );
}

const COLUMN_COUNT = 5;

export function SourceFieldsTable({
  fields,
  onFieldOverrideChange,
  leadingToolbar,
}: SourceFieldsTableProps) {
  const [searchValue, setSearchValue] = useState('');
  // Re-run the filter on the debounced value so typing stays responsive on
  // schemas with hundreds of fields (the input itself always reflects the
  // latest keystroke).
  const debouncedSearch = useDebounce(searchValue, 250);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [hiddenOverrides, setHiddenOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHiddenOverrides({});
  }, [fields]);

  const isFieldHidden = useCallback(
    (fieldName: string): boolean => {
      if (fieldName in hiddenOverrides) return hiddenOverrides[fieldName];
      const field = fields.find(f => f.originalFieldName === fieldName);
      return field?.isHidden ?? false;
    },
    [fields, hiddenOverrides]
  );

  const filteredFields = useMemo(() => {
    let result = fields;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        f =>
          f.originalFieldName.toLowerCase().includes(q) ||
          f.type.toLowerCase().includes(q) ||
          f.alias.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)
      );
    }
    if (filterMode === 'visible') {
      result = result.filter(f => !isFieldHidden(f.originalFieldName));
    } else if (filterMode === 'hidden') {
      result = result.filter(f => isFieldHidden(f.originalFieldName));
    }
    return result;
  }, [fields, debouncedSearch, filterMode, isFieldHidden]);

  const toggleHidden = (fieldName: string) => {
    const newHidden = !isFieldHidden(fieldName);
    setHiddenOverrides(prev => ({ ...prev, [fieldName]: newHidden }));
    onFieldOverrideChange(fieldName, { isHidden: newHidden });
  };

  const totalCount = fields.length;
  const hiddenCount = fields.filter(f => isFieldHidden(f.originalFieldName)).length;
  const visibleCount = totalCount - hiddenCount;

  const headCellClass = 'bg-secondary dark:bg-background sticky top-0 z-10';

  const filteringBlock = (
    <div className='bg-muted/50 flex flex-col gap-1.5 rounded-md p-3 dark:bg-white/5'>
      <label className='flex items-center gap-1.5 text-sm font-medium'>
        Fields filtering
        <Tooltip>
          <TooltipTrigger asChild>
            <span className='text-muted-foreground/50 hover:text-muted-foreground shrink-0 transition-colors'>
              <Info className='size-4 shrink-0' />
            </span>
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            Search and filter the fields exposed to reports from this data mart.
          </TooltipContent>
        </Tooltip>
      </label>
      <div className='flex items-center gap-2'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2' />
          <Input
            placeholder='Search fields'
            value={searchValue}
            onChange={e => {
              setSearchValue(e.target.value);
            }}
            className='bg-background h-8 pl-7 text-sm dark:bg-white/5'
          />
        </div>
        <Tabs
          value={filterMode}
          onValueChange={v => {
            setFilterMode(v as FilterMode);
          }}
        >
          <TabsList>
            <TabsTrigger value='all'>All ({totalCount})</TabsTrigger>
            <TabsTrigger value='visible'>Visible ({visibleCount})</TabsTrigger>
            <TabsTrigger value='hidden'>Hidden ({hiddenCount})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );

  return (
    <div className='space-y-3 py-2'>
      {leadingToolbar ? (
        <div className='grid grid-cols-2 gap-3'>
          {filteringBlock}
          {leadingToolbar}
        </div>
      ) : (
        filteringBlock
      )}

      <div className='relative max-h-[400px] w-full overflow-auto'>
        <table className='w-full table-auto caption-bottom text-sm'>
          <TableHeader className='bg-transparent'>
            <TableRow className='hover:bg-transparent'>
              <TableHead className={`${headCellClass} w-[30%]`}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Name</TooltipTrigger>
                  <TooltipContent>Field name in the source data mart</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={`${headCellClass} w-[25%]`}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Alias</TooltipTrigger>
                  <TooltipContent>Alternative name for the field</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={`${headCellClass} w-[15%]`}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Type</TooltipTrigger>
                  <TooltipContent>Data type of the field</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={`${headCellClass} w-[25%]`}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Aggregation</TooltipTrigger>
                  <TooltipContent>Function used to aggregate values when blending</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={`${headCellClass} w-[5%]`} />
            </TableRow>
          </TableHeader>
          <TableBody className='border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            {filteredFields.map(field => {
              const hidden = isFieldHidden(field.originalFieldName);
              return (
                <TableRow
                  key={field.originalFieldName}
                  className={`group ${hidden ? 'opacity-60' : ''}`}
                >
                  <TableCell style={{ paddingTop: 8, paddingBottom: 8 }}>
                    <div className='flex items-center gap-1.5'>
                      <span className='font-medium'>{field.originalFieldName}</span>
                      {hidden && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <EyeOff className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                          </TooltipTrigger>
                          <TooltipContent>Hidden from reports</TooltipContent>
                        </Tooltip>
                      )}
                      {field.description && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className='text-muted-foreground/50 hover:text-muted-foreground inline-flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100'>
                              <Info className='h-3.5 w-3.5' />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side='top' className='max-w-xs'>
                            {field.description}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell style={{ paddingTop: 8, paddingBottom: 8 }}>
                    <FieldAliasInput
                      initialValue={field.alias}
                      onSave={value => {
                        onFieldOverrideChange(field.originalFieldName, { alias: value });
                      }}
                    />
                  </TableCell>
                  <TableCell
                    className='text-muted-foreground'
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    {field.type}
                  </TableCell>
                  <TableCell style={{ paddingTop: 8, paddingBottom: 8 }}>
                    <Select
                      value={field.aggregateFunction}
                      onValueChange={value => {
                        onFieldOverrideChange(field.originalFieldName, {
                          aggregateFunction: value as AggregateFunction,
                        });
                      }}
                    >
                      <SelectTrigger size='sm' className='h-8 w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGGREGATE_FUNCTIONS.map(fn => (
                          <SelectItem key={fn} value={fn}>
                            {fn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className='text-right' style={{ paddingTop: 8, paddingBottom: 8 }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100'
                          aria-label='Row actions'
                        >
                          <MoreHorizontal className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem
                          className='cursor-pointer'
                          onClick={() => {
                            toggleHidden(field.originalFieldName);
                          }}
                        >
                          {hidden ? (
                            <>
                              <Eye className='mr-2 h-4 w-4' />
                              Show in reports
                            </>
                          ) : (
                            <>
                              <EyeOff className='mr-2 h-4 w-4' />
                              Hide from reports
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredFields.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className='text-center text-gray-400'
                  style={{ whiteSpace: 'nowrap' }}
                >
                  No fields match the current filter
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
