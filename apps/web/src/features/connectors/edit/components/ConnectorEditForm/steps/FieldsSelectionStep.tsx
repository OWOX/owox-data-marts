import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ConnectorFieldsResponseApiDto } from '../../../../../data-storage/shared/api/types/response/connector.response.dto.ts';
import { Info, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  const availableFields = selectedFieldData?.fields ?? [];

  const filteredFields = availableFields.filter(field =>
    field.name.toLowerCase().includes(filterText.toLowerCase().trim())
  );

  const availableFieldNames = availableFields.map(field => field.name);
  const selectedCount = selectedFields.filter(fieldName =>
    availableFieldNames.includes(fieldName)
  ).length;
  const allSelected =
    availableFieldNames.length > 0 && selectedCount === availableFieldNames.length;
  const someSelected = selectedCount > 0 && selectedCount < availableFieldNames.length;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  if (!selectedField || !connectorFields) {
    return null;
  }

  if (!availableFields.length) {
    return null;
  }

  const handleMasterCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    if (onSelectAllFields) {
      onSelectAllFields(availableFieldNames, isChecked);
    } else {
      availableFieldNames.forEach(fieldName => {
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
              Select all fields ({selectedCount}/{availableFieldNames.length})
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
              placeholder='Filter'
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
          {filteredFields.map(field => (
            <div key={field.name} className='flex items-center space-x-2'>
              <input
                type='checkbox'
                id={`field-${field.name}`}
                name='selectedFields'
                value={field.name}
                className='text-primary focus:ring-primary border-border h-4 w-4'
                onChange={e => {
                  onFieldToggle(field.name, e.target.checked);
                }}
                checked={selectedFields.includes(field.name)}
              />
              <label
                htmlFor={`field-${field.name}`}
                className='text-muted-foreground cursor-pointer text-sm'
              >
                <div className='flex items-center gap-2'>{field.name}</div>
              </label>
              {field.name && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className='text-muted-foreground/75 inline-block h-4 w-4 cursor-help' />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Type: {field.type}</p>
                    {field.description && <p>{field.description}</p>}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}
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
