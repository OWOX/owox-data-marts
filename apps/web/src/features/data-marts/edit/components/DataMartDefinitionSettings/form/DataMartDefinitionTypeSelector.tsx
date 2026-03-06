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
import { AlertTriangle } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';

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

  useEffect(() => {
    if (initialType !== undefined && initialType !== selectedType) {
      setSelectedType(initialType);
    }
  }, [initialType, selectedType]);

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
      <div className='space-y-2'>
        <Select
          value={selectedType ?? ''}
          onValueChange={value => {
            handleTypeChange(value as DataMartDefinitionType);
          }}
        >
          <SelectTrigger
            className={cn('dm-card-formcontrol w-full', !selectedType && 'border-red-500/50')}
            aria-label='Definition Type'
          >
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
        {!selectedType && (
          <div className='mt-2 flex items-center gap-1 text-sm text-red-500'>
            <AlertTriangle className='h-4 w-4 shrink-0' />
            <span className=''>Definition configuration is incomplete</span>
          </div>
        )}
      </div>
    </div>
  );
}
