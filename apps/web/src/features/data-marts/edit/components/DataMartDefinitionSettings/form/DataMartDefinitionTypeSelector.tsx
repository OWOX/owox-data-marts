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
import {
  FacebookAdsIcon,
  GoogleAdsIcon,
  GoogleSheetsIcon,
  LinkedInAdsIcon,
  TikTokAdsIcon,
} from '../../../../../../shared/icons';
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
   * Sources shown as a row of logos, the way the list shows Data Owners as avatars: a
   * spreadsheet owner recognises the Google Sheets logo faster than the words "data
   * import". Names stay in the tooltip and for screen readers.
   */
  examples?: { name: string; icon: LocalIcon }[];
}

// Ordered by how often they run in practice; Google Sheets stays because plans and
// targets live there.
const POPULAR_CONNECTORS: { name: string; icon: LocalIcon }[] = [
  { name: 'Facebook Ads', icon: FacebookAdsIcon },
  { name: 'Google Ads', icon: GoogleAdsIcon },
  { name: 'TikTok Ads', icon: TikTokAdsIcon },
  { name: 'LinkedIn Ads', icon: LinkedInAdsIcon },
  { name: 'Google Sheets', icon: GoogleSheetsIcon },
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
                      <span className='inline-flex items-center gap-1'>
                        {option.examples.map(({ name, icon: Icon }) => (
                          <span key={name} title={name} className='inline-flex'>
                            <Icon size={16} />
                            <span className='sr-only'>{name}</span>
                          </span>
                        ))}
                      </span>
                      <span>and others</span>
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
