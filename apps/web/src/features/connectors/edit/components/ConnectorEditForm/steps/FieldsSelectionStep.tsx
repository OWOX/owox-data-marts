import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ConnectorFieldsResponseApiDto } from '../../../../shared/api/types/response';
import { Info, Search, KeyRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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

  const selectedFieldData = connectorFields?.find(field => field.name === selectedField);
  const availableFields = useMemo(
    () => selectedFieldData?.fields ?? [],
    [selectedFieldData?.fields]
  );
  const uniqueKeys = useMemo(
    () => selectedFieldData?.uniqueKeys ?? [],
    [selectedFieldData?.uniqueKeys]
  );

  const filteredFields = availableFields
    .filter(field => field.name.toLowerCase().includes(filterText.toLowerCase().trim()))
    .sort((a, b) => {
      const aIsUniqueKey = uniqueKeys.includes(a.name);
      const bIsUniqueKey = uniqueKeys.includes(b.name);
      if (aIsUniqueKey && !bIsUniqueKey) return -1;
      if (!aIsUniqueKey && bIsUniqueKey) return 1;
      return 0;
    });

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
      <p className='text-muted-foreground text-sm'>
        Select the fields you want to include in the connector.
      </p>

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

          <div className='relative pr-2'>
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
