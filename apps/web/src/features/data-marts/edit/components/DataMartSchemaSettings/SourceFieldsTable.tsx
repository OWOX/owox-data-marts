import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Search } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@owox/ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { BlendedField, BlendedFieldOverride } from '../../../shared/types/relationship.types';
import { useDebounce } from '../../../../../hooks/useDebounce';

const AGGREGATE_FUNCTIONS = ['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'] as const;

type FilterMode = 'all' | 'visible' | 'hidden';

interface SourceFieldsTableProps {
  fields: BlendedField[];
  isSourceIncluded: boolean;
  onFieldOverrideChange: (fieldName: string, override: Partial<BlendedFieldOverride>) => void;
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
      className='h-8 w-32'
    />
  );
}

const COLUMN_COUNT = 6;

export function SourceFieldsTable({
  fields,
  isSourceIncluded,
  onFieldOverrideChange,
}: SourceFieldsTableProps) {
  const [searchValue, setSearchValue] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [hiddenOverrides, setHiddenOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHiddenOverrides({});
  }, [fields]);

  const isFieldHidden = (fieldName: string): boolean => {
    if (fieldName in hiddenOverrides) return hiddenOverrides[fieldName];
    const field = fields.find(f => f.originalFieldName === fieldName);
    return field?.isHidden ?? false;
  };

  const filteredFields = useMemo(() => {
    let result = fields;
    if (searchValue.trim()) {
      const q = searchValue.toLowerCase();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, searchValue, filterMode, hiddenOverrides]);

  const toggleHidden = (fieldName: string) => {
    const newHidden = !isFieldHidden(fieldName);
    setHiddenOverrides(prev => ({ ...prev, [fieldName]: newHidden }));
    onFieldOverrideChange(fieldName, { isHidden: newHidden });
  };

  const totalCount = fields.length;
  const hiddenCount = fields.filter(f => isFieldHidden(f.originalFieldName)).length;
  const visibleCount = totalCount - hiddenCount;

  const filterButtons: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: `All (${totalCount})` },
    { mode: 'visible', label: `Visible (${visibleCount})` },
    { mode: 'hidden', label: `Hidden (${hiddenCount})` },
  ];

  const headCellClass = 'bg-secondary dark:bg-background sticky top-0 z-10';

  return (
    <div className='space-y-4 py-2'>
      <div className='flex items-center gap-2'>
        <div className='relative w-64'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2' />
          <Input
            placeholder='Search fields'
            value={searchValue}
            onChange={e => {
              setSearchValue(e.target.value);
            }}
            className='pl-7'
          />
        </div>
        <div className='flex shrink-0 items-center rounded-md border text-sm'>
          {filterButtons.map(({ mode, label }) => (
            <button
              key={mode}
              type='button'
              className={`px-2.5 py-1.5 transition-colors ${
                filterMode === mode
                  ? 'bg-muted text-foreground rounded-md font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                setFilterMode(mode);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className='relative max-h-[400px] w-full overflow-auto'>
        <table className='w-full table-auto caption-bottom text-sm'>
          <TableHeader className='bg-transparent'>
            <TableRow className='hover:bg-transparent'>
              <TableHead className={`${headCellClass} w-9`} />
              <TableHead className={headCellClass}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Name</TooltipTrigger>
                  <TooltipContent>Field name in the source data mart</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={`${headCellClass} w-24`}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Type</TooltipTrigger>
                  <TooltipContent>Data type of the field</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={`${headCellClass} w-36`}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Alias</TooltipTrigger>
                  <TooltipContent>Alternative name for the field</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={headCellClass}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Description</TooltipTrigger>
                  <TooltipContent>Detailed information about the field</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className={`${headCellClass} w-36`}>
                <Tooltip>
                  <TooltipTrigger className='cursor-default'>Aggregation</TooltipTrigger>
                  <TooltipContent>Function used to aggregate values when blending</TooltipContent>
                </Tooltip>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className='border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            {filteredFields.map(field => {
              const hidden = isFieldHidden(field.originalFieldName);
              return (
                <TableRow
                  key={field.originalFieldName}
                  className={hidden ? 'opacity-40' : undefined}
                >
                  <TableCell
                    className='bg-background dark:bg-muted'
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-8 w-8 p-0'
                          onClick={() => {
                            toggleHidden(field.originalFieldName);
                          }}
                        >
                          {hidden ? (
                            <EyeOff className='text-muted-foreground h-5 w-5' />
                          ) : (
                            <Eye
                              className={`h-5 w-5 ${isSourceIncluded ? 'text-green-500' : 'text-muted-foreground'}`}
                            />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side='left'>
                        {hidden
                          ? 'Field is hidden from output. Click to show.'
                          : 'Field is visible in output. Click to hide.'}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell
                    className='bg-background dark:bg-muted'
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    <span className='font-medium'>{field.originalFieldName}</span>
                  </TableCell>
                  <TableCell
                    className='bg-background text-muted-foreground dark:bg-muted'
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    {field.type}
                  </TableCell>
                  <TableCell
                    className='bg-background dark:bg-muted'
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    <FieldAliasInput
                      initialValue={field.alias}
                      onSave={value => {
                        onFieldOverrideChange(field.originalFieldName, { alias: value });
                      }}
                    />
                  </TableCell>
                  <TableCell
                    className='bg-background text-muted-foreground dark:bg-muted'
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    {field.description || '-'}
                  </TableCell>
                  <TableCell
                    className='bg-background dark:bg-muted'
                    style={{ paddingTop: 8, paddingBottom: 8 }}
                  >
                    <Select
                      value={field.aggregateFunction}
                      onValueChange={value => {
                        onFieldOverrideChange(field.originalFieldName, {
                          aggregateFunction: value,
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
