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
import { FacebookAdsIcon, GoogleSheetsIcon, LinkedInAdsIcon } from '../../../../../../shared/icons';
import type { LocalIcon } from '../../../../../../shared/icons';

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
  /** Secondary text in the list; `examples` replaces it when set. */
  description?: string;
  /**
   * Sources shown with their logos instead of the plain description. A spreadsheet owner
   * recognises the Google Sheets logo faster than the words "data import".
   */
  examples?: { name: string; icon: LocalIcon }[];
}

const POPULAR_CONNECTORS: { name: string; icon: LocalIcon }[] = [
  { name: 'Facebook Ads', icon: FacebookAdsIcon },
  { name: 'Google Sheets', icon: GoogleSheetsIcon },
  { name: 'LinkedIn Ads', icon: LinkedInAdsIcon },
];

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
      examples: POPULAR_CONNECTORS,
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
                  {option.examples ? (
                    <span className='text-muted-foreground/80 ml-2 inline-flex items-center gap-1.5'>
                      {option.examples.map(({ name, icon: Icon }, index, examples) => (
                        <span key={name} className='inline-flex items-center gap-1'>
                          <Icon size={16} />
                          {name}
                          {index < examples.length - 1 ? ',' : ''}
                        </span>
                      ))}
                      <span>and more</span>
                    </span>
                  ) : (
                    <span className='text-muted-foreground/80 ml-2'>{option.description}</span>
                  )}
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
