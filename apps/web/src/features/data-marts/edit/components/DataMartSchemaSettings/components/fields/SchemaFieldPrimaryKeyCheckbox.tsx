import { Checkbox } from '@owox/ui/components/checkbox';

/**
 * Props for the SchemaFieldPrimaryKeyCheckbox component
 */
interface SchemaFieldPrimaryKeyCheckboxProps {
  /** Whether the field is a primary key */
  isPrimaryKey: unknown;
  /** Callback function to call when the primary key status changes */
  onPrimaryKeyChange?: (isPrimaryKey: boolean) => void;
}

/**
 * Checkbox component for indicating whether a field is a primary key
 */
export function SchemaFieldPrimaryKeyCheckbox({
  isPrimaryKey,
  onPrimaryKeyChange,
}: SchemaFieldPrimaryKeyCheckboxProps) {
  // Convert to boolean to ensure proper type
  const isPrimaryKeyBoolean = Boolean(isPrimaryKey);

  // Handle checkbox change
  const handleCheckedChange = (checked: boolean) => {
    if (onPrimaryKeyChange) {
      onPrimaryKeyChange(checked);
    }
  };

  return (
    <Checkbox
      className='cursor-pointer'
      checked={isPrimaryKeyBoolean}
      onCheckedChange={handleCheckedChange}
      aria-label='Primary Key'
    />
  );
}
