import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  BigQueryFieldType,
  AthenaFieldType,
} from '../../../../shared/types/data-mart-schema.types';

// Define storage types
type StorageType = 'bigquery' | 'athena';
type FieldType = BigQueryFieldType | AthenaFieldType;

interface SchemaFieldTypeSelectProps {
  type: FieldType;
  storageType: StorageType;
  onTypeChange?: (newType: FieldType) => void;
}

export function SchemaFieldTypeSelect({
  type,
  storageType,
  onTypeChange,
}: SchemaFieldTypeSelectProps) {
  // Get the appropriate field types based on storage type
  const fieldTypes =
    storageType === 'bigquery' ? Object.values(BigQueryFieldType) : Object.values(AthenaFieldType);

  // Handle type change
  const handleValueChange = (value: string) => {
    if (onTypeChange) {
      // Cast the string value to the appropriate field type
      if (storageType === 'bigquery') {
        onTypeChange(value as BigQueryFieldType);
      } else {
        onTypeChange(value as AthenaFieldType);
      }
    }
  };

  return (
    <Select value={type as string} onValueChange={handleValueChange}>
      <SelectTrigger className='group hover:border-input focus-visible:border-ring focus-visible:dark:bg-input/30 w-full border-0 pr-3 pl-0 shadow-none hover:shadow-xs focus-visible:pl-3 focus-visible:shadow-xs dark:bg-transparent [&_svg]:opacity-0 [&_svg]:group-hover:opacity-50 [&_svg]:group-focus-visible:opacity-50'>
        <SelectValue placeholder='Select type' />
      </SelectTrigger>
      <SelectContent className='max-h-[300px]'>
        {fieldTypes.map(fieldType => (
          <SelectItem key={fieldType} value={fieldType}>
            {fieldType}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
