import { useState } from 'react';
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
}

interface TypeOption {
  type: DataMartDefinitionType;
  label: string;
  description: string;
}

export function DataMartDefinitionTypeSelector({
  initialType,
  onTypeSelect,
}: DataMartDefinitionTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<DataMartDefinitionType | null>(
    initialType ?? null
  );

  const handleTypeChange = (type: DataMartDefinitionType) => {
    setSelectedType(type);
    onTypeSelect(type);
  };

  const typeOptions: TypeOption[] = [
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

  return (
    <div className='dm-card-block'>
      <Label className='text-foreground'>Definition Type</Label>
      <Select
        value={selectedType ?? ''}
        onValueChange={value => {
          handleTypeChange(value as DataMartDefinitionType);
        }}
      >
        <SelectTrigger className='dm-card-formcontrol w-full' aria-label='Definition Type'>
          <SelectValue placeholder='Select definition type'>
            {selectedType && typeOptions.find(opt => opt.type === selectedType)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {typeOptions.map(option => (
              <SelectItem key={option.type} value={option.type}>
                {option.label}
                <span className='text-muted-foreground/80 ml-2'>{option.description}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
