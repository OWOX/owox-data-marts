import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ConnectorFieldsResponseApiDto } from '../../../../shared/api/types/response';
import { Info, Search, KeyRound, ArrowDownWideNarrow, ArrowUpAZ, ArrowUpDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Button } from '@owox/ui/components/button';
import { ConnectorFieldSortOrder } from '../../../../shared/types';

interface FieldsSelectionStepProps {
  connectorFields: ConnectorFieldsResponseApiDto[] | null;
  selectedField: string;
  selectedFields: string[];
  onFieldToggle: (fieldName: string, isChecked: boolean) => void;
  onSelectAllFields?: (fieldNames: string[], isSelected: boolean) => void;
}

export function FieldsSelectionStep({
  connectorFields,
  selectedField,
  selectedFields,
  onFieldToggle,
  onSelectAllFields,
}: FieldsSelectionStepProps) {
  const masterCheckboxRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [filterText, setFilterText] = useState('');
  const [sortOrder, setSortOrder] = useState<ConnectorFieldSortOrder>(
    ConnectorFieldSortOrder.ORIGINAL
  );

  const selectedFieldData = connectorFields?.find(field => field.name === selectedField);
  const availableFields = useMemo(
    () => selectedFieldData?.fields ?? [],
    [selectedFieldData?.fields]
  );
  const uniqueKeys = useMemo(
    () => selectedFieldData?.uniqueKeys ?? [],
    [selectedFieldData?.uniqueKeys]
  );

  const originalIndexByName = useMemo(() => {
    const indexMap = new Map<string, number>();
    availableFields.forEach((field, index) => indexMap.set(field.name, index));
    return indexMap;
  }, [availableFields]);

  const filteredFields = useMemo(() => {
    const filtered = availableFields.filter(field =>
      field.name.toLowerCase().includes(filterText.toLowerCase().trim())
    );

    const comparator = (a: { name: string }, b: { name: string }) => {
      const aIsUniqueKey = uniqueKeys.includes(a.name);
      const bIsUniqueKey = uniqueKeys.includes(b.name);
      if (aIsUniqueKey && !bIsUniqueKey) return -1;
      if (!aIsUniqueKey && bIsUniqueKey) return 1;

      if (sortOrder === ConnectorFieldSortOrder.ASC) return a.name.localeCompare(b.name);
      if (sortOrder === ConnectorFieldSortOrder.DESC) return b.name.localeCompare(a.name);

      const indexA = originalIndexByName.get(a.name) ?? 0;
      const indexB = originalIndexByName.get(b.name) ?? 0;
      return indexA - indexB;
    };

    return [...filtered].sort(comparator);
  }, [availableFields, filterText, uniqueKeys, sortOrder, originalIndexByName]);

  const availableFieldNames = availableFields.map(field => field.name);
  const selectableFieldNames = availableFieldNames.filter(
    fieldName => !uniqueKeys.includes(fieldName)
  );
  const selectedSelectableCount = selectedFields.filter(fieldName =>
    selectableFieldNames.includes(fieldName)
  ).length;
  const selectedTotalCount = selectedFields.filter(fieldName =>
    availableFieldNames.includes(fieldName)
  ).length;
  const allSelected =
    selectableFieldNames.length > 0 && selectedSelectableCount === selectableFieldNames.length;
  const someSelected =
    selectedSelectableCount > 0 && selectedSelectableCount < selectableFieldNames.length;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  useEffect(() => {
    if (uniqueKeys.length > 0) {
      const uniqueKeysToAdd = uniqueKeys.filter(
        keyName =>
          availableFields.some(field => field.name === keyName) && !selectedFields.includes(keyName)
      );

      if (uniqueKeysToAdd.length > 0) {
        uniqueKeysToAdd.forEach(keyName => {
          onFieldToggle(keyName, true);
        });
      }
    }
  }, [selectedField, uniqueKeys, availableFields, selectedFields, onFieldToggle]);

  if (!selectedField || !connectorFields) {
    return null;
  }

  if (!availableFields.length) {
    return null;
  }

  const handleMasterCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    if (onSelectAllFields) {
      onSelectAllFields(selectableFieldNames, isChecked);
    } else {
      selectableFieldNames.forEach(fieldName => {
        const isCurrentlySelected = selectedFields.includes(fieldName);
        if (isChecked && !isCurrentlySelected) {
          onFieldToggle(fieldName, true);
        } else if (!isChecked && isCurrentlySelected) {
          onFieldToggle(fieldName, false);
        }
      });
    }
  };

  return (
    <div className='space-y-4'>
      <h4 className='text-lg font-medium'>Selected field for node: {selectedField}</h4>
      <span className='text-muted-foreground text-sm'>
        Can’t find the field you need? Open an{' '}
        <a
          href='https://github.com/OWOX/owox-data-marts/issues'
          target='_blank'
          rel='noopener noreferrer'
        >
          <Button variant='link' className='cursor-pointer px-0 py-0 text-sm'>
            issue here
          </Button>
        </a>
        .
      </span>

      <div className='space-y-3'>
        <div className='flex items-center justify-between gap-4'>
          <div className='flex items-center space-x-2'>
            <input
              ref={masterCheckboxRef}
              type='checkbox'
              id='master-checkbox'
              className='text-primary focus:ring-primary border-border h-4 w-4'
              checked={allSelected}
              onChange={handleMasterCheckboxChange}
            />
            <label htmlFor='master-checkbox' className='cursor-pointer text-sm font-medium'>
              Select all fields ({selectedTotalCount}/{availableFieldNames.length})
            </label>
          </div>

          <div className='flex items-center gap-2 pr-2'>
            <div className='relative'>
              <Search
                className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 cursor-text'
                onClick={() => {
                  filterInputRef.current?.focus();
                }}
              />
              <input
                ref={filterInputRef}
                type='text'
                placeholder='Search'
                value={filterText}
                onChange={e => {
                  setFilterText(e.target.value);
                }}
                className='focus:border-primary h-8 w-48 rounded-none border-0 bg-transparent pl-9 text-sm outline-none focus:border-b'
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' aria-label='Sort fields'>
                  {sortOrder === ConnectorFieldSortOrder.ASC && <ArrowUpAZ className='h-4 w-4' />}
                  {sortOrder === ConnectorFieldSortOrder.DESC && (
                    <ArrowDownWideNarrow className='h-4 w-4' />
                  )}
                  {sortOrder === ConnectorFieldSortOrder.ORIGINAL && (
                    <ArrowUpDown className='h-4 w-4' />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  onSelect={() => {
                    setSortOrder(ConnectorFieldSortOrder.ASC);
                  }}
                >
                  <ArrowUpAZ className='text-muted-foreground mr-2 h-4 w-4' />
                  A–Z
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setSortOrder(ConnectorFieldSortOrder.DESC);
                  }}
                >
                  <ArrowDownWideNarrow className='text-muted-foreground mr-2 h-4 w-4' />
                  Z–A
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setSortOrder(ConnectorFieldSortOrder.ORIGINAL);
                  }}
                >
                  <ArrowUpDown className='text-muted-foreground mr-2 h-4 w-4' />
                  Original
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className='border-border border-t'></div>

        <div className='flex flex-col gap-3'>
          {filteredFields.map(field => {
            const isUniqueKey = uniqueKeys.includes(field.name);
            return (
              <div key={field.name} className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  id={`field-${field.name}`}
                  name='selectedFields'
                  value={field.name}
                  className='text-primary focus:ring-primary border-border h-4 w-4'
                  onChange={e => {
                    if (!isUniqueKey) {
                      onFieldToggle(field.name, e.target.checked);
                    }
                  }}
                  checked={selectedFields.includes(field.name)}
                  disabled={isUniqueKey}
                />
                <label
                  htmlFor={`field-${field.name}`}
                  className={`cursor-pointer text-sm ${isUniqueKey ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                >
                  <div className='flex items-center gap-2'>
                    {field.name}
                    {isUniqueKey && <KeyRound className='text-primary h-3 w-3' />}
                  </div>
                </label>
                {field.name && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className='text-muted-foreground/75 inline-block h-4 w-4 cursor-help' />
                    </TooltipTrigger>
                    <TooltipContent>
                      {isUniqueKey && (
                        <div className='flex items-center gap-2'>
                          <KeyRound className='text-secondary h-3 w-3' />
                          <p className='font-semibold'>Unique key</p>
                        </div>
                      )}
                      <p>Type: {field.type}</p>
                      {field.description && <p>{field.description}</p>}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })}
          {filteredFields.length === 0 && filterText && (
            <div className='text-muted-foreground py-4 text-center text-sm'>
              No fields match "{filterText}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
