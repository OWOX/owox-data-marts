import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { DataStorageType } from '../../../../../../data-storage';
import {
  AthenaFieldType,
  BigQueryFieldType,
  RedshiftFieldType,
  SnowflakeFieldType,
} from '../../../../../shared/types/data-mart-schema.types';

/**
 * Define storage types
 */
type StorageType =
  | DataStorageType.GOOGLE_BIGQUERY
  | DataStorageType.AWS_ATHENA
  | DataStorageType.SNOWFLAKE
  | DataStorageType.AWS_REDSHIFT;
type FieldType = BigQueryFieldType | AthenaFieldType | SnowflakeFieldType | RedshiftFieldType;

/**
 * Props for the SchemaFieldTypeSelect component
 */
interface SchemaFieldTypeSelectProps {
  /** The current type of the field */
  type: FieldType;
  /** The storage type ('bigquery' or 'athena') */
  storageType: StorageType;
  /** Callback function to call when the type changes */
  onTypeChange?: (newType: FieldType) => void;
}

/**
 * Select component for choosing a field type
 */
export function SchemaFieldTypeSelect({
  type,
  storageType,
  onTypeChange,
}: SchemaFieldTypeSelectProps) {
  // Get the appropriate field types based on storage type
  const fieldTypes =
    storageType === DataStorageType.GOOGLE_BIGQUERY
      ? Object.values(BigQueryFieldType)
      : storageType === DataStorageType.AWS_ATHENA
        ? Object.values(AthenaFieldType)
        : storageType === DataStorageType.SNOWFLAKE
          ? Object.values(SnowflakeFieldType)
          : Object.values(RedshiftFieldType);

  // Handle type change
  const handleValueChange = (value: string) => {
    if (onTypeChange) {
      // Cast the string value to the appropriate field type
      if (storageType === DataStorageType.GOOGLE_BIGQUERY) {
        onTypeChange(value as BigQueryFieldType);
      } else if (storageType === DataStorageType.AWS_ATHENA) {
        onTypeChange(value as AthenaFieldType);
      } else if (storageType === DataStorageType.SNOWFLAKE) {
        onTypeChange(value as SnowflakeFieldType);
      } else {
        onTypeChange(value as RedshiftFieldType);
      }
    }
  };

  return (
    <Select value={type as string} onValueChange={handleValueChange}>
      <SelectTrigger className='cursor-pointer' size='sm'>
        <SelectValue placeholder='Select field type' />
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
