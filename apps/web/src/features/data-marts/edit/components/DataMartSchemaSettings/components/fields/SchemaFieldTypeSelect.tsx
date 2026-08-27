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
  DatabricksFieldType,
  RedshiftFieldType,
  SnowflakeFieldType,
} from '../../../../../shared/types/data-mart-schema.types';

/**
 * The storage types a Data Mart schema can actually be edited for — the only ones
 * `SchemaContent.tsx` ever renders a schema table for, and so the only ones this component (or
 * anything reusing its type list) is ever asked about.
 */
export type SchemaCapableStorageType =
  | DataStorageType.GOOGLE_BIGQUERY
  | DataStorageType.AWS_ATHENA
  | DataStorageType.SNOWFLAKE
  | DataStorageType.AWS_REDSHIFT
  | DataStorageType.DATABRICKS;

/**
 * Props for the SchemaFieldTypeSelect component
 */
interface SchemaFieldTypeSelectProps {
  /** The current type of the field */
  type: string;
  /** The storage type this field belongs to — picks which type list to offer */
  storageType: SchemaCapableStorageType;
  /** Callback function to call when the type changes */
  onTypeChange?: (newType: string) => void;
  /** Accessible name for the trigger; defaults to none (relies on surrounding context) */
  ariaLabel?: string;
}

/**
 * The type list a given storage's schema fields offer. A plain switch with a `never` default —
 * not the old if/else chain falling through to Databricks — so a `SchemaCapableStorageType` that
 * gains a member without a corresponding case here fails to COMPILE instead of silently reusing
 * another storage's type list.
 */
function fieldTypesFor(storageType: SchemaCapableStorageType): readonly string[] {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return Object.values(BigQueryFieldType);
    case DataStorageType.AWS_ATHENA:
      return Object.values(AthenaFieldType);
    case DataStorageType.SNOWFLAKE:
      return Object.values(SnowflakeFieldType);
    case DataStorageType.AWS_REDSHIFT:
      return Object.values(RedshiftFieldType);
    case DataStorageType.DATABRICKS:
      return Object.values(DatabricksFieldType);
    default: {
      const exhaustive: never = storageType;
      throw new Error(
        `SchemaFieldTypeSelect: no field type list for storage type "${String(exhaustive)}"`
      );
    }
  }
}

/**
 * Select component for choosing a field type
 */
export function SchemaFieldTypeSelect({
  type,
  storageType,
  onTypeChange,
  ariaLabel,
}: SchemaFieldTypeSelectProps) {
  const fieldTypes = fieldTypesFor(storageType);

  return (
    <Select value={type} onValueChange={onTypeChange}>
      <SelectTrigger className='cursor-pointer' size='sm' aria-label={ariaLabel}>
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
