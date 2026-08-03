import { useEffect, useState } from 'react';
import { DataMartDefinitionType } from '../../../../shared';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Label } from '@owox/ui/components/label';

interface DataMartDefinitionTypeSelectorProps {
  initialType?: DataMartDefinitionType | null;
  onTypeSelect: (type: DataMartDefinitionType) => void;
  /**
   * Types that cannot be picked here. Used when repointing an existing Data Mart, where a
   * connector is not an option in either direction.
   */
  excludedTypes?: DataMartDefinitionType[];
  /**
   * The type currently saved on the Data Mart. Marked in the list so the user can tell an
   * unsaved pick apart from what the Data Mart actually uses.
   */
  savedType?: DataMartDefinitionType | null;
}

interface TypeOption {
  type: DataMartDefinitionType;
  label: string;
  description: string;
}

export function DataMartDefinitionTypeSelector({
  initialType,
  onTypeSelect,
  excludedTypes,
  savedType,
}: DataMartDefinitionTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<DataMartDefinitionType | null>(
    initialType ?? null
  );

  useEffect(() => {
    if (initialType !== undefined && initialType !== selectedType) {
      setSelectedType(initialType);
    }
  }, [initialType, selectedType]);

  const handleTypeChange = (type: DataMartDefinitionType) => {
    setSelectedType(type);
    onTypeSelect(type);
  };

  const allTypeOptions: TypeOption[] = [
    {
      type: DataMartDefinitionType.SQL,
      label: 'SQL',
      description: 'SQL query',
    },
    {
      type: DataMartDefinitionType.TABLE,
      label: 'Table',
      description: 'Existing table',
    },
    {
      type: DataMartDefinitionType.VIEW,
      label: 'View',
      description: 'Existing view',
    },
    {
      type: DataMartDefinitionType.TABLE_PATTERN,
      label: 'Pattern',
      description: 'Table pattern',
    },
    {
      type: DataMartDefinitionType.CONNECTOR,
      label: 'Connector',
      description: 'Data import from Source to Storage',
    },
  ];

  const typeOptions = allTypeOptions.filter(option => !excludedTypes?.includes(option.type));

  return (
    <div className='dm-card-block'>
      <Label className='text-foreground'>Definition Type</Label>
      <div className='space-y-2'>
        <Select
          value={selectedType ?? ''}
          onValueChange={value => {
            handleTypeChange(value as DataMartDefinitionType);
          }}
        >
          <SelectTrigger className='dm-card-formcontrol w-full' aria-label='Definition Type'>
            <SelectValue placeholder='Select definition type'>
              {selectedType && allTypeOptions.find(opt => opt.type === selectedType)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {typeOptions.map(option => (
                <SelectItem key={option.type} value={option.type}>
                  {option.label}
                  <span className='text-muted-foreground/80 ml-2'>{option.description}</span>
                  {savedType === option.type && (
                    <span className='text-muted-foreground/60 ml-2'>(current)</span>
                  )}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
